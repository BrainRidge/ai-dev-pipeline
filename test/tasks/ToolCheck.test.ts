import { describe, it, expect } from 'vitest'
import {
  blockers,
  commandFor,
  machineLabel,
  reportLines,
  ToolCheck,
  type Finding,
} from '../../src/tasks/ToolCheck'
import { badgeFor, summarise } from '../../src/engine/StepDescriptor'
import type { ToolDef } from '../../src/engine/schema'
import type { ToolProbe } from '../../src/tasks/ToolProbe'
import type { CommandBlock } from '../../src/tasks/context'
import { context, healthyEditor, skillsInstalled, step, toolCheck, TOOLS } from '../support/fixtures'

const STEP = step('toolCheck', { stepType: 'toolCheck', taskType: 'toolCheck' })
const CTX = context({ order: ['toolCheck'] })

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
  platforms: {},
}

const MAVEN: ToolDef = { ...JAVA, id: 'maven', label: 'Maven', command: 'mvn', required: false, minVersion: undefined }

function block(view: { commands?: CommandBlock[] }): CommandBlock {
  return view.commands![0]!
}

/** The report line for one label. The editor checks come first, so position
 *  is not something a test should depend on. */
function line(view: { commands?: CommandBlock[] }, label: string): string {
  return block(view).lines.find((l) => l.startsWith(label))!
}

describe('the Tool Check step', () => {
  it('is a step type of its own, so the panel badges it without being told', () => {
    expect(badgeFor(STEP, undefined)).toBe('TOOLS')
  })

  it('spends no model call: every answer comes from the tool itself', async () => {
    const asked: string[] = []
    const task = toolCheck({
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
    const task = toolCheck({ probe: probeOf({ git: 'git version 2.50.1' }) })
    const view = await task.describe(STEP, CTX, {})
    expect(line(view, 'Git')).toContain('✓  2.50.1')
    expect(view.text).toMatch(/Everything this workflow needs is installed/)
  })

  it('says what is missing, why it is wanted and how to install it here', async () => {
    const task = toolCheck({ tools: [JAVA], probe: probeOf({ java: false }) })
    const report = block(await task.describe(STEP, CTX, {})).lines.join('\n')

    expect(report).toMatch(/Java \(JDK\)\s+✗\s+not found/)
    expect(report).toContain('Java (JDK) — required')
    expect(report).toContain('Why      Copilot builds what it changes.')
    // The platform is pinned in the fixture, so the hint is the macOS one.
    expect(report).toContain('Install  brew install openjdk@21')
  })

  it('marks a tool that is present but below the floor, and names the floor', async () => {
    const task = toolCheck({ tools: [JAVA], probe: probeOf({ java: 'java version "1.8.0_392"' }) })
    const report = block(await task.describe(STEP, CTX, {})).lines.join('\n')
    expect(report).toContain('⚠  1.8.0 — needs 17 or newer')
  })

  it('accepts a tool whose version it cannot parse, rather than failing a working machine', async () => {
    const task = toolCheck({ tools: [JAVA], probe: probeOf({ java: 'a bespoke wrapper' }) })
    const view = await task.describe(STEP, CTX, {})
    expect(line(view, 'Java (JDK)')).toContain('✓')
    expect(task.validate(STEP, {}).ok).toBe(true)
  })

  it('distinguishes an optional tool that is absent from a required one', async () => {
    const task = toolCheck({ tools: [MAVEN], probe: probeOf({ mvn: false }) })
    const report = block(await task.describe(STEP, CTX, {})).lines.join('\n')
    expect(report).toMatch(/Maven\s+–\s+not found \(optional\)/)
    expect(report).toContain('Maven — optional')
  })
})

describe('what blocks the step', () => {
  it('lets the task continue when every required tool is there', async () => {
    const task = toolCheck({ tools: [JAVA, MAVEN], probe: probeOf({ java: 'openjdk version "21"', mvn: false }) })
    await task.describe(STEP, CTX, {})
    expect(task.validate(STEP, {})).toEqual({ ok: true, errors: {} })
  })

  it('refuses to continue while a required tool is missing', async () => {
    const task = toolCheck({ tools: [JAVA], probe: probeOf({ java: false }) })
    await task.describe(STEP, CTX, {})

    const result = task.validate(STEP, {})
    expect(result.ok).toBe(false)
    expect(result.errors.tools).toMatch(/Java \(JDK\) is missing/)
  })

  it('refuses to continue while a required tool is too old', async () => {
    const task = toolCheck({ tools: [JAVA], probe: probeOf({ java: 'java version "11.0.1"' }) })
    await task.describe(STEP, CTX, {})
    expect(task.validate(STEP, {}).ok).toBe(false)
  })

  it('never blocks on an optional tool, however many are missing', async () => {
    const task = toolCheck({ tools: [MAVEN, { ...MAVEN, id: 'g', command: 'gradle' }], probe: probeOf({}) })
    await task.describe(STEP, CTX, {})
    expect(task.validate(STEP, {}).ok).toBe(true)
  })

  // Fails closed. In the panel `describe` always runs before a button can be
  // pressed, so this is the state nobody should reach — and if it is reached,
  // saying so is safer than waving the task through unchecked.
  it('refuses to continue when the check has not run at all', () => {
    expect(toolCheck().validate(STEP, {}).errors.tools).toMatch(/has not run yet/)
  })
})

describe('a tool list that cannot be read', () => {
  function broken(): ToolCheck {
    return new ToolCheck(
      async () => {
        throw new Error('Tool config at /team/config/tools.json is not valid JSON: bad')
      },
      { async run() { return { found: true, output: '' } } },
      { async copy() {}, async toTerminal() {} },
      healthyEditor,
      skillsInstalled,
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
    const task = toolCheck({ source: 'external', path: '/team/config/tools.json' })
    expect(block(await task.describe(STEP, CTX, {})).note).toBe(
      'Tool list: /team/config/tools.json (external)',
    )
  })

  it('says so plainly when the bundled default was used', async () => {
    expect(block(await toolCheck().describe(STEP, CTX, {})).note).toBe('Tool list: bundled default')
  })

  it('records the list and the findings on the step, for the audit trail', async () => {
    const task = toolCheck({ source: 'external', path: '/team/config/tools.json' })
    await task.describe(STEP, CTX, {})
    const result = await task.execute(STEP, CTX, {})

    expect(result.toolsSource).toBe('external')
    expect(result.toolsPath).toBe('/team/config/tools.json')
    expect(result.findings).toEqual([
      expect.objectContaining({ id: 'agentMode', status: 'ok' }),
      expect.objectContaining({ id: 'chatCommand', status: 'ok' }),
      expect.objectContaining({ id: 'git', status: 'ok', version: '2.50.1' }),
    ])
  })
})

describe('asking the machine again', () => {
  it('probes once and remembers, since a render describes every step', async () => {
    let calls = 0
    const task = toolCheck({
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
    const task = toolCheck({
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
    expect(block(await toolCheck().describe(STEP, CTX, {})).actions).toEqual([])
  })

  it('is not editable, unlike a composed prompt', async () => {
    expect(block(await toolCheck().describe(STEP, CTX, {})).editable).toBeFalsy()
  })

  it('offers Copy on the step, for a machine somebody else has to fix', async () => {
    const copied: string[] = []
    const task = toolCheck({ sink: { async copy(t) { copied.push(t) }, async toTerminal() {} } })

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
    expect(summarise(STEP, record, undefined)).toBe('2 of 3 checks passed')
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

/**
 * The step reports which machine it decided it was on, and runs whatever that
 * machine needs. Both matter for the same reason: a developer reading a
 * surprising report cannot make sense of it without knowing which commands ran.
 * See spec Section 17.
 */
describe('the machine it ran on', () => {
  it('names macOS, Windows and Linux the way a developer would', () => {
    expect(machineLabel('darwin')).toBe('macOS')
    expect(machineLabel('win32')).toBe('Windows')
    expect(machineLabel('linux')).toBe('Linux')
  })

  it('falls back to the raw platform rather than guessing a friendly name', () => {
    expect(machineLabel('freebsd')).toBe('freebsd')
  })

  /**
   * In the block's label and in the sentence above it, not in the caption. The
   * caption is small grey text for provenance; which machine ran the commands
   * decides what the whole report means, so it is read first or not at all.
   * See spec Section 17.
   */
  it('names the machine in the report’s label, which is bold and full size', async () => {
    expect(block(await toolCheck().describe(STEP, CTX, {})).label).toBe('Tool check on macOS')
  })

  it('says it again in the sentence above, which is ordinary body text', async () => {
    const view = await toolCheck().describe(STEP, CTX, {})
    expect(view.text).toMatch(/^Checked on macOS\./)
  })

  it('says it on Windows too, in a developer’s own words', async () => {
    const win = toolCheck({ platform: 'win32' })
    const view = await win.describe(STEP, CTX, {})
    expect(block(view).label).toBe('Tool check on Windows')
    expect(view.text).toMatch(/^Checked on Windows\./)
  })

  it('leaves the caption to the tool list alone', async () => {
    expect(block(await toolCheck().describe(STEP, CTX, {})).note).not.toContain('macOS')
  })

  it('records it on the step, so a session log can say which machines a team uses', async () => {
    const task = toolCheck()
    await task.describe(STEP, CTX, {})
    const result = await task.execute(STEP, CTX, {})
    expect(result).toMatchObject({ platform: 'darwin', machine: 'macOS' })
  })
})

describe('a tool that is a different program on a different platform', () => {
  const base: ToolDef = {
    id: 'shell',
    label: 'Shell',
    command: 'bash',
    args: ['--version'],
    required: true,
    why: '',
    install: {},
    platforms: {},
  }

  it('uses the tool’s own command where no override is given', () => {
    expect(commandFor(base, 'darwin')).toEqual({ command: 'bash', args: ['--version'] })
  })

  it('uses the override for the platform it is on', () => {
    const tool = { ...base, platforms: { win32: { command: 'powershell', args: ['-Command', '$PSVersionTable'] } } }
    expect(commandFor(tool, 'win32')).toEqual({
      command: 'powershell',
      args: ['-Command', '$PSVersionTable'],
    })
  })

  it('leaves other platforms alone', () => {
    const tool = { ...base, platforms: { win32: { command: 'powershell' } } }
    expect(commandFor(tool, 'darwin')).toEqual({ command: 'bash', args: ['--version'] })
  })

  // Each key is optional on its own, so a tool that is the same program with
  // different flags does not have to repeat its name.
  it('overrides the command alone, keeping the args', () => {
    const tool = { ...base, platforms: { win32: { command: 'bash.exe' } } }
    expect(commandFor(tool, 'win32')).toEqual({ command: 'bash.exe', args: ['--version'] })
  })

  it('overrides the args alone, keeping the command', () => {
    const tool = { ...base, platforms: { win32: { args: ['-v'] } } }
    expect(commandFor(tool, 'win32')).toEqual({ command: 'bash', args: ['-v'] })
  })

  it('actually runs the override, rather than only computing it', async () => {
    const asked: string[] = []
    const task = toolCheck({
      tools: [{ ...base, platforms: { darwin: { command: 'zsh', args: ['-c', 'true'] } } }],
      probe: {
        async run(command, args) {
          asked.push([command, ...args].join(' '))
          return { found: true, output: 'zsh 5.9' }
        },
      },
    })

    await task.describe(STEP, CTX, {})
    expect(asked).toEqual(['zsh -c true'])
  })
})

/**
 * The step reports on two things now, and the second is what Copilot has been
 * given to work with. See spec Section 18.
 */
describe('the skills half of the step', () => {
  it('shows both halves, numbered, tools first', async () => {
    const lines = block(await toolCheck().describe(STEP, CTX, {})).lines
    expect(lines.indexOf('1. Tools on this machine')).toBeGreaterThanOrEqual(0)
    expect(lines.indexOf('2. Skills available to Copilot')).toBeGreaterThan(
      lines.indexOf('1. Tools on this machine'),
    )
  })

  it('says which skills are in place and where they went', async () => {
    const report = block(await toolCheck().describe(STEP, CTX, {})).lines.join('\n')
    expect(report).toContain('codebase-analyst')
    expect(report).toContain('Installed to /Users/you/.copilot/skills')
  })

  // Skills are an enhancement: the persona text reaches Copilot through the
  // composed prompt either way, so a failure here must never stop a task.
  it('never blocks the step, whatever happened to the skills', async () => {
    const task = toolCheck({
      skills: {
        async install() {
          return {
            dir: '/Users/you/.copilot/skills',
            supported: true,
            findings: [{ name: 'broken', status: 'unusable', detail: 'no description' }],
          }
        },
      },
    })

    await task.describe(STEP, CTX, {})
    expect(task.validate(STEP, {}).ok).toBe(true)
  })

  it('survives an installer that throws, reporting it rather than blanking the step', async () => {
    const task = toolCheck({
      skills: {
        async install() {
          throw new Error('read-only home directory')
        },
      },
    })

    const view = await task.describe(STEP, CTX, {})
    expect(view.commands![0]!.lines.join('\n')).toContain('read-only home directory')
    expect(task.validate(STEP, {}).ok).toBe(true)
  })

  it('records what was installed on the step, for the audit trail', async () => {
    const task = toolCheck()
    await task.describe(STEP, CTX, {})
    const result = await task.execute(STEP, CTX, {})

    expect(result.skillsDir).toBe('/Users/you/.copilot/skills')
    expect(result.skills).toEqual([
      expect.objectContaining({ name: 'codebase-analyst', status: 'unchanged' }),
    ])
  })

  it('installs once per session, not on every render', async () => {
    let calls = 0
    const task = toolCheck({
      skills: {
        async install() {
          calls += 1
          return { dir: '/d', supported: true, findings: [] }
        },
      },
    })

    await task.describe(STEP, CTX, {})
    await task.describe(STEP, CTX, {})
    expect(calls).toBe(1)
  })
})
