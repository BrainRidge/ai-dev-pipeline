import { describe, it, expect } from 'vitest'
import {
  AGENT_SETTING,
  CHAT_COMMAND,
  readEnvironment,
  type EnvironmentReader,
} from '../../src/tasks/Environment'
import { blockers } from '../../src/tasks/ToolCheck'
import { context, step, toolCheck } from '../support/fixtures'

function editor(over: Partial<{ agent: boolean | undefined; commands: string[] }> = {}): EnvironmentReader {
  return {
    setting: () => ('agent' in over ? over.agent : true),
    commands: async () => over.commands ?? [CHAT_COMMAND],
  }
}

const find = <T extends { id: string }>(fs: T[], id: string): T => fs.find((f) => f.id === id)!

/**
 * Spec Section 8 has recorded this since P1 under known friction: agent mode has
 * to be enabled, the check was specified, it was never implemented, and a
 * developer with it off found out when Copilot answered in chat instead of
 * editing files — several steps into a task. See spec Section 17.
 */
describe('what the editor says about agent mode', () => {
  it('reads the documented setting rather than guessing', async () => {
    const asked: string[] = []
    await readEnvironment({
      setting: (id) => {
        asked.push(id)
        return true
      },
      commands: async () => [],
    })
    expect(asked).toContain(AGENT_SETTING)
  })

  it('passes when agent mode is on', async () => {
    expect(find(await readEnvironment(editor({ agent: true })), 'agentMode').status).toBe('ok')
  })

  it('reports it as off when it is off, and says how to turn it on', async () => {
    const f = find(await readEnvironment(editor({ agent: false })), 'agentMode')
    expect(f.status).toBe('off')
    expect(f.fix).toContain(AGENT_SETTING)
    // The likelier cause on a corporate machine, so it is worth naming.
    expect(f.fix).toMatch(/organisation/i)
  })

  /**
   * The setting arrived in VS Code 1.99. On anything older it does not exist and
   * `get` returns undefined — which is not the same as "off", and must not be
   * reported as one.
   */
  it('says it could not be checked when the setting does not exist', async () => {
    const f = find(await readEnvironment(editor({ agent: undefined })), 'agentMode')
    expect(f.status).toBe('unknown')
    expect(f.detail).toMatch(/1\.99 or later/)
    expect(f.fix).toBeUndefined()
  })

  it('is required, because the coding steps expect files to change', async () => {
    expect(find(await readEnvironment(editor()), 'agentMode').required).toBe(true)
  })
})

describe('what the editor says about the one-click handoff', () => {
  it('passes when the chat command is registered', async () => {
    expect(find(await readEnvironment(editor()), 'chatCommand').status).toBe('ok')
  })

  it('reports it missing when it is not, and says what that costs', async () => {
    const f = find(await readEnvironment(editor({ commands: [] })), 'chatCommand')
    expect(f.status).toBe('missing')
    expect(f.detail).toMatch(/fall back to the clipboard/)
    expect(f.detail).toMatch(/Nothing breaks/)
  })

  /**
   * The handoff ladder degrades to the clipboard and then to a file, and both
   * rungs work — spec Section 8 is explicit that the value is in the composed
   * prompt rather than in how it reaches the chat box. So this costs a paste,
   * not a task.
   */
  it('is not required, because mechanisms B and C both work', async () => {
    expect(find(await readEnvironment(editor()), 'chatCommand').required).toBe(false)
  })
})

describe('the editor checks inside the step', () => {
  const STEP = step('toolCheck', { stepType: 'toolCheck', taskType: 'toolCheck' })
  const CTX = context({ order: ['toolCheck'] })

  it('leads the report, since it is the thing that cannot be installed', async () => {
    const view = await toolCheck().describe(STEP, CTX, {})
    const lines = view.commands![0]!.lines
    expect(lines[0]).toContain('Copilot agent mode')
    expect(lines[1]).toContain('One-click handoff')
  })

  it('stops the task when agent mode is off', async () => {
    const task = toolCheck({ environment: editor({ agent: false }) })
    await task.describe(STEP, CTX, {})

    const result = task.validate(STEP, {})
    expect(result.ok).toBe(false)
    expect(result.errors.tools).toContain('Copilot agent mode')
  })

  // A check that could not be made must not become a verdict.
  it('does not stop the task when agent mode could not be checked', async () => {
    const task = toolCheck({ environment: editor({ agent: undefined }) })
    await task.describe(STEP, CTX, {})
    expect(task.validate(STEP, {}).ok).toBe(true)
  })

  it('does not stop the task for a missing chat command', async () => {
    const task = toolCheck({ environment: editor({ commands: [] }) })
    await task.describe(STEP, CTX, {})
    expect(task.validate(STEP, {}).ok).toBe(true)
  })

  it('records the editor findings on the step, for the audit trail', async () => {
    const task = toolCheck({ environment: editor({ agent: false, commands: [] }) })
    await task.describe(STEP, CTX, {})
    const findings = (await task.execute(STEP, CTX, {})).findings as { id: string; status: string }[]

    expect(find(findings, 'agentMode').status).toBe('off')
    expect(find(findings, 'chatCommand').status).toBe('missing')
  })

  it('counts an unknown check as neither passed nor blocking', async () => {
    const task = toolCheck({ environment: editor({ agent: undefined }) })
    await task.describe(STEP, CTX, {})
    const findings = (await task.execute(STEP, CTX, {})).findings as Parameters<typeof blockers>[0]
    expect(blockers(findings)).toEqual([])
  })
})

/**
 * The report's wording has to suit a setting as well as a program. "Install
 * agent mode" and "agent mode is too old" are both nonsense, and both were what
 * came out before the editor checks were allowed to word themselves.
 */
describe('the report reads correctly for a setting', () => {
  const STEP = step('toolCheck', { stepType: 'toolCheck', taskType: 'toolCheck' })
  const CTX = context({ order: ['toolCheck'] })

  async function reportWith(env: EnvironmentReader) {
    const task = toolCheck({ environment: env })
    const view = await task.describe(STEP, CTX, {})
    return { text: view.text!, report: view.commands![0]!.lines.join('\n'), task }
  }

  it('says a setting is turned off, not that it is missing or old', async () => {
    const { report, task } = await reportWith(editor({ agent: false }))
    expect(report).toContain('turned off')
    expect(task.validate(STEP, {}).errors.tools).toContain('Copilot agent mode is turned off')
    expect(task.validate(STEP, {}).errors.tools).not.toMatch(/too old|missing/)
  })

  it('offers a fix rather than an install for a setting', async () => {
    const { report } = await reportWith(editor({ agent: false }))
    expect(report).toMatch(/Fix\s+Turn on chat\.agent\.enabled/)
  })

  it('still says Install for something that really is installed', async () => {
    const { report } = await reportWith(editor())
    // Gradle is optional and absent on most machines; whichever tool is missing,
    // its hint is an install.
    if (report.includes('— optional')) expect(report).toMatch(/Install\s+/)
  })

  it('tells the developer to fix rather than to install, in the step text', async () => {
    const { text } = await reportWith(editor({ agent: false }))
    expect(text).toContain('Fix what the report names')
    expect(text).not.toContain('Install what is missing')
  })
})
