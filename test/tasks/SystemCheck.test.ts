import { describe, it, expect } from 'vitest'
import { blockers, reportLines, SystemCheck, type Finding } from '../../src/tasks/SystemCheck'
import { badgeFor, summarise } from '../../src/engine/StepDescriptor'
import type { ToolDef } from '../../src/engine/schema'
import type { ToolProbe } from '../../src/tasks/ToolProbe'
import type { CommandBlock } from '../../src/tasks/context'
import { context, step, systemCheck, TOOLS } from '../support/fixtures'

const STEP = step('systemCheck', { stepType: 'systemCheck', taskType: 'systemCheck' })
const CTX = context({ order: ['systemCheck'] })

/** A probe that answers per command, so a mixed machine can be described. */
function probeOf(answers: Record<string, string | false>): ToolProbe {
  return {
    async run(command) {
      const answer = answers[command]
      return answer === false || answer === undefined
        ? { found: false, output: '' }
        : { found: true, output: answer }
    },
  }
}

const JAVA: ToolDef = {
  id: 'java',
  label: 'Java (JDK)',
  command: 'java',
  args: ['-version'],
  required: true,
  minVersion: '17',
  why: 'Copilot builds what it changes.',
  install: { darwin: 'brew install openjdk@21', win32: 'winget install Temurin' },
}

const MAVEN: ToolDef = { ...JAVA, id: 'maven', label: 'Maven', command: 'mvn', required: false, minVersion: undefined }

function block(view: { commands?: CommandBlock[] }): CommandBlock {
  return view.commands![0]!
}

describe('the System Check step', () => {
  it('is a step type of its own, so the panel badges it without being told', () => {
    expect(badgeFor(STEP, undefined)).toBe('SYSTEM')
  })

  it('spends no model call: every answer comes from the tool itself', async () => {
    const asked: string[] = []
    const task = systemCheck({
      tools: [JAVA],
      probe: {
        async run(command, args) {
          asked.push([command, ...args].join(' '))
          return { found: true, output: 'openjdk version "21.0.8" 2025-07-15' }
        },
      },
    })

    await task.describe(STEP, CTX, {})
    expect(asked).toEqual(['java -version'])
  })

  it('reports a tool it found, with the version it read back', async () => {
    const task = systemCheck({ probe: probeOf({ git: 'git version 2.50.1' }) })
    const view = await task.describe(STEP, CTX, {})
    expect(block(view).lines[0]).toBe('Git  ✓  2.50.1')
    expect(view.text).toMatch(/Everything this workflow needs is installed/)
  })

  it('says what is missing, why it is wanted and how to install it here', async () => {
    const task = systemCheck({ tools: [JAVA], probe: probeOf({ java: false }) })
    const report = block(await task.describe(STEP, CTX, {})).lines.join('\n')

    expect(report).toContain('Java (JDK)  ✗  not found')
    expect(report).toContain('Java (JDK) — required')
    expect(report).toContain('Why      Copilot builds what it changes.')
    // The platform is pinned in the fixture, so the hint is the macOS one.
    expect(report).toContain('Install  brew install openjdk@21')
  })

  it('marks a tool that is present but below the floor, and names the floor', async () => {
    const task = systemCheck({ tools: [JAVA], probe: probeOf({ java: 'java version "1.8.0_392"' }) })
    const report = block(await task.describe(STEP, CTX, {})).lines.join('\n')
    expect(report).toContain('⚠  1.8.0 — needs 17 or newer')
  })

  it('accepts a tool whose version it cannot parse, rather than failing a working machine', async () => {
    const task = systemCheck({ tools: [JAVA], probe: probeOf({ java: 'a bespoke wrapper' }) })
    const view = await task.describe(STEP, CTX, {})
    expect(block(view).lines[0]).toBe('Java (JDK)  ✓  installed')
    expect(task.validate(STEP, {}).ok).toBe(true)
  })

  it('distinguishes an optional tool that is absent from a required one', async () => {
    const task = systemCheck({ tools: [MAVEN], probe: probeOf({ mvn: false }) })
    const report = block(await task.describe(STEP, CTX, {})).lines.join('\n')
    expect(report).toContain('Maven  –  not found (optional)')
    expect(report).toContain('Maven — optional')
  })
})

describe('what blocks the step', () => {
  it('lets the task continue when every required tool is there', async () => {
    const task = systemCheck({ tools: [JAVA, MAVEN], probe: probeOf({ java: 'openjdk version "21"', mvn: false }) })
    await task.describe(STEP, CTX, {})
    expect(task.validate(STEP, {})).toEqual({ ok: true, errors: {} })
  })

  it('refuses to continue while a required tool is missing', async () => {
    const task = systemCheck({ tools: [JAVA], probe: probeOf({ java: false }) })
    await task.describe(STEP, CTX, {})

    const result = task.validate(STEP, {})
    expect(result.ok).toBe(false)
    expect(result.errors.tools).toMatch(/Java \(JDK\) is still missing or too old/)
  })

  it('refuses to continue while a required tool is too old', async () => {
    const task = systemCheck({ tools: [JAVA], probe: probeOf({ java: 'java version "11.0.1"' }) })
    await task.describe(STEP, CTX, {})
    expect(task.validate(STEP, {}).ok).toBe(false)
  })

  it('never blocks on an optional tool, however many are missing', async () => {
    const task = systemCheck({ tools: [MAVEN, { ...MAVEN, id: 'g', command: 'gradle' }], probe: probeOf({}) })
    await task.describe(STEP, CTX, {})
    expect(task.validate(STEP, {}).ok).toBe(true)
  })

  // Fails closed. In the panel `describe` always runs before a button can be
  // pressed, so this is the state nobody should reach — and if it is reached,
  // saying so is safer than waving the task through unchecked.
  it('refuses to continue when the check has not run at all', () => {
    expect(systemCheck().validate(STEP, {}).errors.tools).toMatch(/has not run yet/)
  })
})

describe('a tool list that cannot be read', () => {
  function broken(): SystemCheck {
    return new SystemCheck(
      async () => {
        throw new Error('Tool config at /team/config/tools.json is not valid JSON: bad')
      },
      { async run() { return { found: true, output: '' } } },
      { async copy() {}, async toTerminal() {} },
      'darwin',
    )
  }

  // Returned rather than thrown, for the reason spec Section 8 gives: the
  // descriptor describes every step, so throwing would blank the whole panel.
  it('shows the loader’s own words on the step that owns the list', async () => {
    const view = await broken().describe(STEP, CTX, {})
    expect(view.text).toContain('is not valid JSON: bad')
    expect(view.commands).toBeUndefined()
  })

  it('still offers Re-check, which is how a corrected path is picked up', async () => {
    const view = await broken().describe(STEP, CTX, {})
    expect(view.actions.map((a) => a.id)).toContain('recheck')
  })

  it('blocks the step', async () => {
    const task = broken()
    await task.describe(STEP, CTX, {})
    expect(task.validate(STEP, {}).ok).toBe(false)
  })
})

describe('provenance, so a silent fallback is visible afterwards', () => {
  it('captions the report with the team’s file when there is one', async () => {
    const task = systemCheck({ source: 'external', path: '/team/config/tools.json' })
    expect(block(await task.describe(STEP, CTX, {})).note).toBe(
      'Tool list: /team/config/tools.json (external)',
    )
  })

  it('says so plainly when the bundled default was used', async () => {
    expect(block(await systemCheck().describe(STEP, CTX, {})).note).toBe('Tool list: bundled default')
  })

  it('records the list and the findings on the step, for the audit trail', async () => {
    const task = systemCheck({ source: 'external', path: '/team/config/tools.json' })
    await task.describe(STEP, CTX, {})
    const result = await task.execute(STEP, CTX, {})

    expect(result.toolsSource).toBe('external')
    expect(result.toolsPath).toBe('/team/config/tools.json')
    expect(result.findings).toEqual([
      expect.objectContaining({ id: 'git', status: 'ok', version: '2.50.1' }),
    ])
  })
})

describe('asking the machine again', () => {
  it('probes once and remembers, since a render describes every step', async () => {
    let calls = 0
    const task = systemCheck({
      probe: {
        async run() {
          calls += 1
          return { found: true, output: 'git version 2.50.1' }
        },
      },
    })

    await task.describe(STEP, CTX, {})
    await task.describe(STEP, CTX, {})
    expect(calls).toBe(1)
  })

  it('asks again once the developer says they have installed something', async () => {
    let found = false
    const task = systemCheck({
      probe: {
        async run() {
          return found ? { found: true, output: 'git version 2.50.1' } : { found: false, output: '' }
        },
      },
    })

    await task.describe(STEP, CTX, {})
    expect(task.validate(STEP, {}).ok).toBe(false)

    found = true
    task.invalidate()
    await task.describe(STEP, CTX, {})
    expect(task.validate(STEP, {}).ok).toBe(true)
  })
})

describe('the report as a block the renderer already knows how to draw', () => {
  it('carries no buttons of its own: it is a report, not commands to run', async () => {
    expect(block(await systemCheck().describe(STEP, CTX, {})).actions).toEqual([])
  })

  it('is not editable, unlike a composed prompt', async () => {
    expect(block(await systemCheck().describe(STEP, CTX, {})).editable).toBeFalsy()
  })

  it('offers Copy on the step, for a machine somebody else has to fix', async () => {
    const copied: string[] = []
    const task = systemCheck({ sink: { async copy(t) { copied.push(t) }, async toTerminal() {} } })

    const view = await task.describe(STEP, CTX, {})
    expect(view.actions.map((a) => a.id)).toEqual(['recheck', 'copy', 'submit'])

    await task.copyReport(STEP, CTX)
    expect(copied[0]).toContain('Git')
  })
})

describe('the report text itself', () => {
  const finding = (over: Partial<Finding>): Finding => ({
    id: 'x',
    label: 'X',
    required: true,
    status: 'ok',
    why: '',
    ...over,
  })

  it('aligns the marks under each other, however long the names are', () => {
    const lines = reportLines([
      finding({ label: 'Git', version: '2.50.1' }),
      finding({ label: 'Java (JDK)', version: '21' }),
    ])
    expect(lines[0]).toBe('Git         ✓  2.50.1')
    expect(lines[1]).toBe('Java (JDK)  ✓  21')
  })

  it('says something rather than nothing for an empty list', () => {
    expect(reportLines([])).toEqual(['The tool list is empty, so nothing was checked.'])
  })

  it('counts only required problems as blockers', () => {
    const findings = [
      finding({ id: 'a', status: 'missing', required: true }),
      finding({ id: 'b', status: 'missing', required: false }),
      finding({ id: 'c', status: 'outdated', required: true }),
      finding({ id: 'd', status: 'ok', required: true }),
    ]
    expect(blockers(findings).map((f) => f.id)).toEqual(['a', 'c'])
  })
})

describe('what the panel shows for a step already passed', () => {
  it('summarises how much of the list was found', () => {
    const record = {
      status: 'complete' as const,
      result: { findings: [{ status: 'ok' }, { status: 'missing' }, { status: 'ok' }] },
    }
    expect(summarise(STEP, record, undefined)).toBe('2 of 3 tools found')
  })

  it('says only that it was checked when the list was empty', () => {
    expect(summarise(STEP, { status: 'complete', result: { findings: [] } }, undefined)).toBe('Checked')
  })
})

describe('the fixture tool list', () => {
  it('is one required tool, which is what the workflow tests lean on', () => {
    expect(TOOLS.map((t) => t.id)).toEqual(['git'])
    expect(TOOLS[0]!.required).toBe(true)
  })
})
