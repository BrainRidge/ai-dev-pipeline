import { describe, it, expect } from 'vitest'
import { InvokeCopilot } from '../../src/tasks/InvokeCopilot'
import type { Handoff, Mechanism } from '../../src/handoff/ChatHandoff'
import type { PromptComposer } from '../../src/prompt/PromptComposer'
import type { AuditLog, AuditEntry } from '../../src/audit/AuditLog'
import type { CommandSink } from '../../src/tasks/CommandSink'
import { context, step } from '../support/fixtures'

const noSink: CommandSink = { async copy() {}, async toTerminal() {} }

const handoffStep = step('aiHandoff', { stepType: 'aiHandoff', taskType: 'invokeCopilot' })
const ctx = context()

const composer = {
  async compose() {
    return { prompt: 'COMPOSED PROMPT', outputFile: '02-analysis.md' }
  },
  async outputFor() {
    return '02-analysis.md'
  },
} as unknown as PromptComposer

function fakeAudit(): AuditLog & { logged: AuditEntry[] } {
  const logged: AuditEntry[] = []
  return {
    logged,
    async append(e: AuditEntry) {
      logged.push(e)
    },
  } as unknown as AuditLog & { logged: AuditEntry[] }
}

function handoffReturning(m: Mechanism): Handoff {
  return { async deliver() { return m } }
}

function task(mechanism: Mechanism = 'A', present = true): InvokeCopilot {
  return new InvokeCopilot(
    composer,
    handoffReturning(mechanism),
    fakeAudit(),
    async () => present,
    noSink,
  )
}

describe('InvokeCopilot', () => {
  it('is an aiHandoff step', () => {
    expect(task().stepType).toBe('aiHandoff')
  })

  it('blocks completion when the output file is missing', () => {
    const r = task().validate(handoffStep, {
      confirmed: true,
      outputPresent: false,
      outputFile: '02-analysis.md',
    })
    expect(r.ok).toBe(false)
    expect(r.errors.output).toContain('02-analysis.md')
  })

  it('blocks completion when the developer has not confirmed', () => {
    expect(task().validate(handoffStep, { confirmed: false, outputPresent: true }).ok).toBe(false)
  })

  it('completes only when both conditions hold', () => {
    expect(task().validate(handoffStep, { confirmed: true, outputPresent: true }).ok).toBe(true)
  })

  it('logs the composed prompt BEFORE delivering it', async () => {
    const order: string[] = []
    const handoff: Handoff = {
      async deliver() {
        order.push('deliver')
        return 'A'
      },
    }
    const audit = {
      async append(e: AuditEntry) {
        order.push(e.kind)
      },
    } as unknown as AuditLog
    await new InvokeCopilot(composer, handoff, audit, async () => true, noSink).deliver(
      handoffStep,
      ctx,
    )
    expect(order).toEqual(['prompt-composed', 'deliver'])
  })

  it('records the full prompt in the audit entry', async () => {
    const audit = fakeAudit()
    const s = new InvokeCopilot(composer, handoffReturning('A'), audit, async () => true, noSink)
    await s.deliver(handoffStep, ctx)
    expect(audit.logged[0]!.data!.prompt).toBe('COMPOSED PROMPT')
  })

  it('records which mechanism was used', async () => {
    expect((await task('B').deliver(handoffStep, ctx)).mechanism).toBe('B')
  })

  it('reports where the artifact will land, so the review step can find it', async () => {
    expect(await task().outputPath(handoffStep, ctx)).toBe('/tasks/T-1/02-analysis.md')
  })

  it('shows the composed prompt, so it can be read before it is sent', async () => {
    const view = await task().describe(handoffStep, ctx, {})
    expect(view.commands).toHaveLength(1)
    expect(view.commands![0]!.label).toBe('Composed prompt')
    expect(view.commands![0]!.lines.join('\n')).toBe('COMPOSED PROMPT')
  })

  it('offers Copy and Send on the prompt block, never Terminal', async () => {
    const block = (await task().describe(handoffStep, ctx, {})).commands![0]!
    expect(block.actions!.map((a) => a.id)).toEqual(['copy', 'send'])
  })

  it('puts that same prompt on the clipboard', async () => {
    const copied: string[] = []
    const s = new InvokeCopilot(
      composer,
      handoffReturning('A'),
      fakeAudit(),
      async () => true,
      { async copy(t) { copied.push(t) }, async toTerminal() {} },
    )
    const { text, label } = await s.copyPrompt(handoffStep, ctx)
    expect(copied).toEqual(['COMPOSED PROMPT'])
    expect(text).toBe('COMPOSED PROMPT')
    expect(label).toMatch(/prompt/i)
  })

  it('reports a broken template on the step instead of throwing', async () => {
    const broken = {
      async compose() {
        throw new Error('template "x.md" must declare "output:"')
      },
    } as unknown as PromptComposer
    const s = new InvokeCopilot(broken, handoffReturning('A'), fakeAudit(), async () => true, noSink)

    const view = await s.describe(handoffStep, ctx, {})
    expect(view.commands).toBeUndefined()
    expect(view.text).toContain('could not be composed')
    expect(view.text).toContain('must declare "output:"')
  })

  it('offers Send and Done actions', async () => {
    expect((await task().describe(handoffStep, ctx, {})).actions.map((a) => a.id)).toEqual(['send', 'done'])
  })

  it('reports the resolved output path and its presence from execute', async () => {
    expect(await task('A', true).execute(handoffStep, ctx, { mechanism: 'A' })).toMatchObject({
      outputPath: '/tasks/T-1/02-analysis.md',
      outputFile: '02-analysis.md',
      outputPresent: true,
      mechanism: 'A',
    })
  })

  it('reports a missing artifact rather than pretending it arrived', async () => {
    expect(await task('A', false).execute(handoffStep, ctx, {})).toMatchObject({
      outputPresent: false,
    })
  })
})

describe('editing the composed prompt', () => {
  const edited = { edited: { prompt: 'MY OWN WORDS' } }

  it('offers the prompt as an editable block', async () => {
    const view = await task().describe(handoffStep, ctx, {})
    expect(view.commands![0]!.editable).toBe(true)
  })

  it('shows the developer’s text back to them instead of recomposing', async () => {
    const view = await task().describe(handoffStep, ctx, edited)
    expect(view.commands![0]!.lines.join('\n')).toBe('MY OWN WORDS')
  })

  it('offers Reset only once there is an edit to undo', async () => {
    const clean = await task().describe(handoffStep, ctx, {})
    expect(clean.commands![0]!.actions!.map((a) => a.id)).toEqual(['copy', 'send'])

    const dirty = await task().describe(handoffStep, ctx, edited)
    expect(dirty.commands![0]!.actions!.map((a) => a.id)).toEqual(['copy', 'send', 'reset'])
  })

  it('ignores an edit that is only whitespace', async () => {
    const view = await task().describe(handoffStep, ctx, { edited: { prompt: '   ' } })
    expect(view.commands![0]!.lines.join('\n')).toBe('COMPOSED PROMPT')
  })

  it('delivers the edited text, not the generated text', async () => {
    const sent: string[] = []
    const t = new InvokeCopilot(
      composer,
      { async deliver(p) { sent.push(p); return 'A' } },
      fakeAudit(),
      async () => true,
      noSink,
    )
    await t.deliver(handoffStep, ctx, 'MY OWN WORDS')
    expect(sent).toEqual(['MY OWN WORDS'])
  })

  it('still contracts for the artifact the template declares', async () => {
    const delivery = await task().deliver(handoffStep, ctx, 'MY OWN WORDS')
    expect(delivery.outputPath).toContain('02-analysis.md')
  })

  it('records what was actually sent, which is the point of the log', async () => {
    const audit = fakeAudit()
    const t = new InvokeCopilot(composer, handoffReturning('A'), audit, async () => true, noSink)
    await t.deliver(handoffStep, ctx, 'MY OWN WORDS')
    expect(audit.logged[0]!.data!.prompt).toBe('MY OWN WORDS')
  })

  it('copies the edited text rather than the generated text', async () => {
    const copied: string[] = []
    const sink = { async copy(t: string) { copied.push(t) }, async toTerminal() {} }
    const t = new InvokeCopilot(composer, handoffReturning('A'), fakeAudit(), async () => true, sink)
    await t.copyPrompt(handoffStep, ctx, 'MY OWN WORDS')
    expect(copied).toEqual(['MY OWN WORDS'])
  })
})
