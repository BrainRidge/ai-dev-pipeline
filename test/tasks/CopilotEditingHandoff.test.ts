import { describe, it, expect } from 'vitest'
import { InvokeCopilotCoding } from '../../src/tasks/InvokeCopilotCoding'
import { InvokeCopilotCodeReview } from '../../src/tasks/InvokeCopilotCodeReview'
import type { Handoff, Mechanism } from '../../src/handoff/ChatHandoff'
import type { PromptComposer } from '../../src/prompt/PromptComposer'
import type { AuditLog, AuditEntry } from '../../src/audit/AuditLog'
import type { CommandSink } from '../../src/tasks/CommandSink'
import { context, step } from '../support/fixtures'

const noSink: CommandSink = { async copy() {}, async toTerminal() {} }

const coding = step('CodeImplementation', {
  stepType: 'aiHandoff',
  taskType: 'invokeCopilotCoding',
})
const ctx = context()

/** An editing template declares no output, so compose returns none. */
const composer = {
  async compose() {
    return {
      prompt: 'COMPOSED PROMPT',
      outputFile: undefined,
      templatePath: '/team/prompts/newFeatureWorkflow/CodeImplementation.md',
      templateSource: 'external' as const,
      includes: [],
      references: [],
    }
  },
  async resolved() {
    return {
      path: '/team/prompts/newFeatureWorkflow/CodeImplementation.md',
      source: 'external' as const,
    }
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

const handoffReturning = (m: Mechanism): Handoff => ({ async deliver() { return m } })

const task = (m: Mechanism = 'A') =>
  new InvokeCopilotCoding(composer, handoffReturning(m), fakeAudit(), noSink)

describe('InvokeCopilotCoding', () => {
  it('is an aiHandoff step named by the workflow JSON', () => {
    expect(task().name).toBe('invokeCopilotCoding')
    expect(task().stepType).toBe('aiHandoff')
  })

  it('completes on the developer’s confirmation alone', () => {
    expect(task().validate(coding, { confirmed: true }).ok).toBe(true)
  })

  it('will not complete without it', () => {
    const r = task().validate(coding, { confirmed: false })
    expect(r.ok).toBe(false)
    expect(r.errors.confirmed).toMatch(/once Copilot has finished/i)
  })

  it('ignores outputPresent, because there is no artifact to wait for', () => {
    expect(task().validate(coding, { confirmed: true, outputPresent: false }).ok).toBe(true)
  })

  it('shows its prompt too, so an editing handoff is not a black box', async () => {
    const view = await task().describe(coding, ctx, {})
    expect(view.commands![0]!.lines.join('\n')).toBe('COMPOSED PROMPT')
    expect(view.commands![0]!.actions!.map((a) => a.id)).toEqual(['copy', 'send'])
  })

  it('offers Send and Done actions', async () => {
    expect((await task().describe(coding, ctx, {})).actions.map((a) => a.id)).toEqual(['send', 'done'])
  })

  it('tells the developer to look at the diff before marking it done', async () => {
    expect((await task().describe(coding, ctx, {})).text).toMatch(/what it changed/i)
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
    await new InvokeCopilotCoding(composer, handoff, audit, noSink).deliver(coding, ctx)
    expect(order).toEqual(['prompt-composed', 'deliver'])
  })

  it('records the full prompt, which is all the audit trail can capture here', async () => {
    const audit = fakeAudit()
    await new InvokeCopilotCoding(composer, handoffReturning('A'), audit, noSink).deliver(coding, ctx)
    expect(audit.logged[0]!.data!.prompt).toBe('COMPOSED PROMPT')
  })

  it('promises no artifact path, since it produces none', async () => {
    expect((await task().deliver(coding, ctx)).outputPath).toBeUndefined()
  })

  it('records the mechanism and that completion rested on the developer', async () => {
    expect(await task().execute(coding, ctx, { mechanism: 'B' })).toEqual({
      mechanism: 'B',
      confirmedByDeveloper: true,
    })
  })
})

describe('InvokeCopilotCodeReview', async () => {
  const review = new InvokeCopilotCodeReview(composer, handoffReturning('A'), fakeAudit(), noSink)

  it('is registered under its own name so a workflow can name it', () => {
    expect(review.name).toBe('invokeCopilotCodeReview')
  })

  it('reads as a review step, not an implementation one', async () => {
    const view = await review.describe(step('CodeReview', { stepType: 'aiHandoff' }), ctx, {})
    expect(view.text).toMatch(/review the changes/i)
  })

  it('shares the confirmation rule with the coding step', () => {
    expect(review.validate(coding, { confirmed: true }).ok).toBe(true)
    expect(review.validate(coding, {}).ok).toBe(false)
  })
})

describe('editing an editing handoff’s prompt', () => {
  it('offers the prompt as an editable block here too', async () => {
    const view = await task().describe(coding, ctx, {})
    expect(view.commands![0]!.editable).toBe(true)
  })

  it('shows the developer’s text back to them', async () => {
    const view = await task().describe(coding, ctx, { edited: { prompt: 'DO IT MY WAY' } })
    expect(view.commands![0]!.lines.join('\n')).toBe('DO IT MY WAY')
    expect(view.commands![0]!.actions!.map((a) => a.id)).toEqual(['copy', 'send', 'reset'])
  })

  it('delivers and records the edited text', async () => {
    const sent: string[] = []
    const audit = fakeAudit()
    const t = new InvokeCopilotCoding(
      composer,
      { async deliver(p) { sent.push(p); return 'A' } },
      audit,
      noSink,
    )
    await t.deliver(coding, ctx, 'DO IT MY WAY')
    expect(sent).toEqual(['DO IT MY WAY'])
    expect(audit.logged[0]!.data!.prompt).toBe('DO IT MY WAY')
  })

  it('copies the edited text', async () => {
    const copied: string[] = []
    const sink = { async copy(t: string) { copied.push(t) }, async toTerminal() {} }
    const t = new InvokeCopilotCoding(composer, handoffReturning('A'), fakeAudit(), sink)
    await t.copyPrompt(coding, ctx, 'DO IT MY WAY')
    expect(copied).toEqual(['DO IT MY WAY'])
  })
})

describe('provenance on an editing handoff', () => {
  it('records the template path and source, even with no output contract', async () => {
    const audit = fakeAudit()
    const t = new InvokeCopilotCoding(composer, handoffReturning('A'), audit, noSink)
    await t.deliver(coding, ctx)
    expect(audit.logged[0]!.data).toMatchObject({
      templatePath: '/team/prompts/newFeatureWorkflow/CodeImplementation.md',
      templateSource: 'external',
      includes: [],
      references: [],
    })
  })

  it('captions the prompt block so a team override is visible on screen', async () => {
    const view = await task().describe(coding, ctx, {})
    expect(view.commands?.[0]?.note).toBe(
      'Template: /team/prompts/newFeatureWorkflow/CodeImplementation.md (external)',
    )
  })
})
