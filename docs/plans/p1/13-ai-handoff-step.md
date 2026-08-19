# Task 13: AiHandoffStep

> Part of the [Phase 1 implementation plan](README.md). Completed and shipped.

**Files:**
- Create: `src/steps/AiHandoffStep.ts`, `src/handoff/ChatHandoff.ts`
- Modify: `src/steps/registry.ts`
- Test: `test/steps/AiHandoffStep.test.ts`

**Interfaces:**
- Consumes: `PromptComposer` (Task 12), `AuditLog` (Task 6)
- Produces: `interface Handoff { deliver(prompt: string): Promise<'A' | 'B' | 'C'> }`, `class ChatHandoff implements Handoff`
- Produces: `new AiHandoffStep(composer, handoff, audit, fileExists)`; `execute` returns `{ mechanism, promptChars, outputPath, outputPresent }`

**Note:** the primary mechanism is whichever Task 0 established. The ladder below is unchanged regardless — only which rung succeeds first differs.

- [ ] **Step 1: Write the failing test**

```typescript
// test/steps/AiHandoffStep.test.ts
import { describe, it, expect } from 'vitest'
import { AiHandoffStep } from '../../src/steps/AiHandoffStep'
import type { StepDef } from '../../src/engine/schema'

const step: StepDef = { id: 'analyse', kind: 'ai-handoff', title: 'Analyse',
                        prompt: 'research-analysis.md', output: '02-analysis.md' }
const ctx = { platform: { id: 'p', label: 'P', services: [] }, taskDir: '/tasks/T',
              epic: 'E', taskId: 'T', answersOf: () => ({}) }

const composer = { async compose() { return 'COMPOSED PROMPT' } }
const audit = { entries: [] as unknown[], async append(e: unknown) { this.entries.push(e) } }

describe('AiHandoffStep', () => {
  it('blocks completion when the output file is missing', async () => {
    const handoff = { async deliver() { return 'A' as const } }
    const step13 = new AiHandoffStep(composer as never, handoff, audit as never, async () => false)
    const r = step13.validate(step, { confirmed: true })
    expect(r.ok).toBe(false)
    expect(r.errors.output).toMatch(/02-analysis\.md/)
  })

  it('blocks completion when the developer has not confirmed', async () => {
    const handoff = { async deliver() { return 'A' as const } }
    const step13 = new AiHandoffStep(composer as never, handoff, audit as never, async () => true)
    expect(step13.validate(step, { confirmed: false }).ok).toBe(false)
  })

  it('logs the composed prompt before delivering it', async () => {
    const order: string[] = []
    const handoff = { async deliver() { order.push('deliver'); return 'A' as const } }
    const auditing = { async append(e: { kind: string }) { order.push(e.kind) } }
    const s = new AiHandoffStep(composer as never, handoff, auditing as never, async () => true)
    await s.deliver(step, ctx as never, [])
    expect(order).toEqual(['prompt-composed', 'deliver'])
  })

  it('records which mechanism was used', async () => {
    const handoff = { async deliver() { return 'B' as const } }
    const s = new AiHandoffStep(composer as never, handoff, audit as never, async () => true)
    expect((await s.deliver(step, ctx as never, [])).mechanism).toBe('B')
  })

  it('offers Send and Done actions', () => {
    const handoff = { async deliver() { return 'A' as const } }
    const s = new AiHandoffStep(composer as never, handoff, audit as never, async () => true)
    expect(s.describe(step, ctx as never, {}).actions.map(a => a.id)).toEqual(['send', 'done'])
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/steps/AiHandoffStep.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/handoff/ChatHandoff.ts`**

```typescript
import * as vscode from 'vscode'

export type Mechanism = 'A' | 'B' | 'C'

export interface Handoff {
  deliver(prompt: string, taskDir: string): Promise<Mechanism>
}

/** Ladder from spec Section 8. Every rung is functional — the value is in the
 *  composed prompt, not in how it reaches the chat box. */
export class ChatHandoff implements Handoff {
  async deliver(prompt: string, taskDir: string): Promise<Mechanism> {
    try {
      await vscode.commands.executeCommand('workbench.action.chat.open', { query: prompt, mode: 'agent' })
      return 'A'
    } catch { /* fall through */ }

    try {
      await vscode.env.clipboard.writeText(prompt)
      await vscode.commands.executeCommand('workbench.action.chat.open')
      void vscode.window.showInformationMessage('Prompt copied to the clipboard — paste it into Copilot Chat.')
      return 'B'
    } catch { /* fall through */ }

    const file = vscode.Uri.file(`${taskDir}/.engine/prompt.md`)
    await vscode.workspace.fs.writeFile(file, Buffer.from(prompt, 'utf8'))
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file))
    void vscode.window.showWarningMessage('Could not open Copilot Chat. The prompt is open in an editor tab.')
    return 'C'
  }
}
```

- [ ] **Step 4: Implement `src/steps/AiHandoffStep.ts`**

```typescript
import { join } from 'node:path'
import type { StepDef } from '../engine/schema'
import type { PromptComposer } from '../prompt/PromptComposer'
import type { AuditLog } from '../audit/AuditLog'
import type { Handoff, Mechanism } from '../handoff/ChatHandoff'
import type { Answers, StepContext, StepHandler, StepView, ValidationResult } from './StepHandler'

export class AiHandoffStep implements StepHandler {
  readonly kind = 'ai-handoff' as const

  constructor(
    private readonly composer: PromptComposer,
    private readonly handoff: Handoff,
    private readonly audit: AuditLog,
    private readonly fileExists: (p: string) => Promise<boolean>,
  ) {}

  describe(step: StepDef, _ctx: StepContext, _values: Answers): StepView {
    return {
      text: `Send the composed prompt to Copilot, then mark this step done once ` +
            `\`${step.output}\` has been written.`,
      actions: [
        { id: 'send', label: 'Send to Copilot' },
        { id: 'done', label: 'Done', primary: true },
      ],
    }
  }

  /** Both conditions are required — spec D9. */
  validate(step: StepDef, values: Answers): ValidationResult {
    const errors: Record<string, string> = {}
    if (!values.confirmed) errors.confirmed = 'Mark the step done once Copilot has finished.'
    if (!values.outputPresent) {
      errors.output = `${step.output} has not been written yet. Reopen the chat and try again.`
    }
    return { ok: Object.keys(errors).length === 0, errors }
  }

  async deliver(
    step: StepDef, ctx: StepContext, repos: { name: string; path: string }[],
  ): Promise<{ mechanism: Mechanism; promptChars: number }> {
    const prompt = await this.composer.compose(step, ctx, repos)
    // Written BEFORE delivery so a crash still leaves the record.
    await this.audit.append({ kind: 'prompt-composed', stepId: step.id,
                              data: { prompt, chars: prompt.length } })
    const mechanism = await this.handoff.deliver(prompt, ctx.taskDir)
    return { mechanism, promptChars: prompt.length }
  }

  async execute(step: StepDef, ctx: StepContext, values: Answers): Promise<Record<string, unknown>> {
    const outputPath = join(ctx.taskDir, step.output!)
    return {
      outputPath,
      outputPresent: await this.fileExists(outputPath),
      mechanism: values.mechanism ?? null,
    }
  }
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run test/steps/AiHandoffStep.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Wire the `send` action and the file watcher into `TaskSession`**

In `TaskSession`'s action handler, before calling `engine.submit`:

```typescript
if (actionId === 'send') {
  const handler = this.handlerFor('ai-handoff') as AiHandoffStep
  const repos = (await this.engine.state()).steps['checkout']?.result?.repos ?? []
  const { mechanism } = await handler.deliver(step, this.ctx, repos as never)
  this.pendingMechanism = mechanism
  this.bridge.progress(stepId, `Prompt delivered via mechanism ${mechanism}. Waiting for output…`)
  return
}
```

Then add the watcher to `TaskSession.open`, so the Done button's blocking error clears the
moment Copilot writes the file rather than only when the developer clicks again:

```typescript
// in TaskSession.open, after the engine is constructed
const watcher = vscode.workspace.createFileSystemWatcher(
  new vscode.RelativePattern(vscode.Uri.file(ws.dir), '*.md'))

const onOutputChanged = async (uri: vscode.Uri) => {
  const step = await engine.current()
  if (step.kind !== 'ai-handoff') return
  if (!uri.fsPath.endsWith(step.output!)) return
  await session.markOutputPresent()
}

watcher.onDidCreate(onOutputChanged)
watcher.onDidChange(onOutputChanged)
context.subscriptions.push(watcher, panel)
```

And on the session:

```typescript
private outputPresent = false
private pendingMechanism: Mechanism | undefined

async markOutputPresent(): Promise<void> {
  this.outputPresent = true
  await this.audit.append({ kind: 'output-detected', stepId: (await this.engine.current()).id })
  await this.refresh({ outputPresent: true, mechanism: this.pendingMechanism }, {})
}
```

The `done` action then submits `{ confirmed: true, outputPresent: this.outputPresent, mechanism: this.pendingMechanism }`, which is exactly the pair `AiHandoffStep.validate` requires (D9).

- [ ] **Step 7: Register the handler**

```typescript
new AiHandoffStep(
  new PromptComposer(join(context.extensionPath, 'prompts')),
  new ChatHandoff(), new AuditLog(ctx.taskDir),
  async p => { try { await access(p); return true } catch { return false } },
)
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: AI handoff step with fallback ladder and dual completion condition"
```
