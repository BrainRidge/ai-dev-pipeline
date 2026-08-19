# Task 14: ArtifactReviewStep and ConfirmStep

> Part of the [Phase 1 implementation plan](README.md). Completed and shipped.

**Files:**
- Create: `src/steps/ArtifactReviewStep.ts`, `src/steps/ConfirmStep.ts`
- Modify: `src/steps/registry.ts`
- Test: `test/steps/ArtifactReviewStep.test.ts`

**Interfaces:**
- Produces: `new ArtifactReviewStep(openFile: (path: string) => Promise<void>, hashFile: (p: string) => Promise<string>)`
- Produces: `new ConfirmStep()`

- [ ] **Step 1: Write the failing test**

```typescript
// test/steps/ArtifactReviewStep.test.ts
import { describe, it, expect } from 'vitest'
import { ArtifactReviewStep } from '../../src/steps/ArtifactReviewStep'
import { ConfirmStep } from '../../src/steps/ConfirmStep'
import type { StepDef } from '../../src/engine/schema'

const step: StepDef = { id: 'review', kind: 'artifact-review', title: 'Review',
                        artifact: '02-analysis.md', onRevise: 'analyse' }
const ctx = { platform: { id: 'p', label: 'P', services: [] }, taskDir: '/tasks/T',
              epic: 'E', taskId: 'T', answersOf: () => ({}) }

describe('ArtifactReviewStep', () => {
  it('offers Revise and Approve, in that order', () => {
    const s = new ArtifactReviewStep(async () => {}, async () => 'h')
    expect(s.describe(step, ctx as never, {}).actions.map(a => a.id)).toEqual(['revise', 'approve'])
  })

  it('opens the artifact in an editor when described', async () => {
    const opened: string[] = []
    const s = new ArtifactReviewStep(async p => { opened.push(p) }, async () => 'h')
    await s.open(step, ctx as never)
    expect(opened).toEqual(['/tasks/T/02-analysis.md'])
  })

  it('records the artifact hash on approval', async () => {
    const s = new ArtifactReviewStep(async () => {}, async () => 'deadbeef')
    expect(await s.execute(step, ctx as never, {})).toMatchObject({ artifactHash: 'deadbeef' })
  })
})

describe('ConfirmStep', () => {
  it('offers No and Yes', () => {
    const s = new ConfirmStep()
    const d = s.describe({ id: 'c', kind: 'confirm', title: 'Sure?', text: 'Really?' }, ctx as never, {})
    expect(d.actions.map(a => a.id)).toEqual(['no', 'yes'])
    expect(d.text).toBe('Really?')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/steps/ArtifactReviewStep.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement both handlers**

```typescript
// src/steps/ArtifactReviewStep.ts
import { join } from 'node:path'
import type { StepDef } from '../engine/schema'
import type { Answers, StepContext, StepHandler, StepView, ValidationResult } from './StepHandler'

/** Review happens in a real editor tab, not in the panel — which is why editing
 *  a generated artifact works with no extra implementation. See spec Section 9. */
export class ArtifactReviewStep implements StepHandler {
  readonly kind = 'artifact-review' as const

  constructor(
    private readonly openFile: (path: string) => Promise<void>,
    private readonly hashFile: (path: string) => Promise<string>,
  ) {}

  describe(step: StepDef, _ctx: StepContext, _values: Answers): StepView {
    return {
      text: `${step.artifact} is open in an editor tab. Read it, edit it if you want to, ` +
            `then approve it or send it back for another pass.`,
      actions: [{ id: 'revise', label: 'Revise' }, { id: 'approve', label: 'Approve', primary: true }],
    }
  }

  async open(step: StepDef, ctx: StepContext): Promise<void> {
    await this.openFile(join(ctx.taskDir, step.artifact!))
  }

  validate(): ValidationResult { return { ok: true, errors: {} } }

  async execute(step: StepDef, ctx: StepContext, _values: Answers): Promise<Record<string, unknown>> {
    const path = join(ctx.taskDir, step.artifact!)
    return { artifactPath: path, artifactHash: await this.hashFile(path), approved: true }
  }
}
```

```typescript
// src/steps/ConfirmStep.ts
import type { StepDef } from '../engine/schema'
import type { Answers, StepContext, StepHandler, StepView, ValidationResult } from './StepHandler'

export class ConfirmStep implements StepHandler {
  readonly kind = 'confirm' as const

  describe(step: StepDef, _ctx: StepContext, _values: Answers): StepView {
    return { text: step.text ?? '', actions: [{ id: 'no', label: 'No' }, { id: 'yes', label: 'Yes', primary: true }] }
  }

  validate(): ValidationResult { return { ok: true, errors: {} } }

  async execute(_step: StepDef, _ctx: StepContext, values: Answers): Promise<Record<string, unknown>> {
    return { confirmed: values.actionId === 'yes' }
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/steps/ArtifactReviewStep.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Register both handlers and call `open` on entering an artifact-review step**

In `TaskSession.refresh`, when the current step's kind is `artifact-review`, call the handler's `open` before rendering.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: artifact review and confirm steps"
```
