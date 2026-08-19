# Task 4: Step handler interface and FormStep

> Part of the [Phase 1 implementation plan](README.md). Completed and shipped.

**Files:**
- Create: `src/steps/StepHandler.ts`, `src/steps/FormStep.ts`, `src/steps/registry.ts`
- Create: `src/providers/Provider.ts`, `src/providers/ManualProvider.ts`
- Test: `test/steps/FormStep.test.ts`

**Interfaces:**
- Consumes: `StepDef`, `FieldDef`, `PlatformDef` (Task 2)
- Produces:
  ```typescript
  interface StepContext { platform: PlatformDef; taskDir: string; epic: string; taskId: string
                        ; answersOf(stepId: string): Answers }
  interface ValidationResult { ok: boolean; errors: Record<string, string> }
  interface StepHandler {
    readonly kind: StepKind
    describe(step: StepDef, ctx: StepContext, values: Answers): StepView
    validate(step: StepDef, values: Answers): ValidationResult
    execute(step: StepDef, ctx: StepContext, values: Answers): Promise<Record<string, unknown>>
  }
  interface StepView { fields?: RenderField[]; text?: string; actions: ActionDef[] }
  interface RenderField extends FieldDef { options?: { value: string; label: string }[] }
  interface ActionDef { id: string; label: string; primary?: boolean }
  ```
- Produces: `stepRegistry: Map<StepKind, StepHandler>`

- [ ] **Step 1: Write the failing test**

```typescript
// test/steps/FormStep.test.ts
import { describe, it, expect } from 'vitest'
import { FormStep } from '../../src/steps/FormStep'
import type { StepDef } from '../../src/engine/schema'

const platform = { id: 'canada-assisted', label: 'CA', services: [
  { id: 'payments', label: 'Payments', gitUrl: 'git@x:payments.git' },
  { id: 'orders',   label: 'Orders',   gitUrl: 'git@x:orders.git' },
]}
const ctx = { platform, taskDir: '/tmp/t', answersOf: () => ({}) }

const step: StepDef = {
  id: 'scope', kind: 'form', title: 'Scope',
  fields: [
    { id: 'services', type: 'multiselect', label: 'Services', source: 'platform.services', required: true },
    { id: 'question', type: 'textarea',    label: 'Question', required: true },
  ],
}

describe('FormStep', () => {
  const handler = new FormStep()

  it('expands platform.services into options', () => {
    const view = handler.describe(step, ctx, {})
    expect(view.fields![0]!.options).toEqual([
      { value: 'payments', label: 'Payments' }, { value: 'orders', label: 'Orders' },
    ])
  })

  it('offers Back and Continue actions', () => {
    expect(handler.describe(step, ctx, {}).actions.map(a => a.id)).toEqual(['back', 'submit'])
  })

  it('fails validation when a required field is empty', () => {
    const r = handler.validate(step, { services: [], question: '' })
    expect(r.ok).toBe(false)
    expect(r.errors.question).toMatch(/required/i)
    expect(r.errors.services).toMatch(/required/i)
  })

  it('passes validation when required fields are filled', () => {
    expect(handler.validate(step, { services: ['payments'], question: 'why' }).ok).toBe(true)
  })

  it('returns the submitted values from execute', async () => {
    const values = { services: ['payments'], question: 'why' }
    expect(await handler.execute(step, ctx, values)).toEqual(values)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/steps/FormStep.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the provider seam**

```typescript
// src/providers/Provider.ts
import type { FieldDef } from '../engine/schema'

/** The MCP migration seam. Today only ManualProvider exists; a JiraMcpProvider
 *  registers here later with no change to the engine, steps, or renderer. */
export interface Provider {
  readonly name: string
  /** Options to offer for this field, or undefined for free entry. */
  options(field: FieldDef): Promise<{ value: string; label: string }[] | undefined>
}

export class ProviderRegistry {
  private readonly providers = new Map<string, Provider>()
  register(p: Provider): void { this.providers.set(p.name, p) }
  get(name: string): Provider {
    const p = this.providers.get(name)
    if (!p) throw new Error(`unknown provider: ${name}`)
    return p
  }
}
```

```typescript
// src/providers/ManualProvider.ts
import type { Provider } from './Provider'
import type { FieldDef } from '../engine/schema'

/** Renders as a plain input. The developer supplies the value by hand. */
export class ManualProvider implements Provider {
  readonly name = 'manual'
  async options(_field: FieldDef): Promise<undefined> { return undefined }
}
```

- [ ] **Step 4: Implement `src/steps/StepHandler.ts` and `src/steps/FormStep.ts`**

```typescript
// src/steps/StepHandler.ts
import type { StepDef, StepKind, FieldDef, PlatformDef } from '../engine/schema'

export type Answers = Record<string, unknown>
export interface ActionDef { id: string; label: string; primary?: boolean }
export interface RenderField extends FieldDef { options?: { value: string; label: string }[] }
export interface StepView { fields?: RenderField[]; text?: string; actions: ActionDef[] }
export interface ValidationResult { ok: boolean; errors: Record<string, string> }

export interface StepContext {
  platform: PlatformDef
  taskDir: string
  epic: string
  taskId: string
  answersOf(stepId: string): Answers
}

export interface StepHandler {
  readonly kind: StepKind
  describe(step: StepDef, ctx: StepContext, values: Answers): StepView
  validate(step: StepDef, values: Answers): ValidationResult
  execute(step: StepDef, ctx: StepContext, values: Answers): Promise<Record<string, unknown>>
}
```

```typescript
// src/steps/FormStep.ts
import type { StepDef } from '../engine/schema'
import type { Answers, StepContext, StepHandler, StepView, ValidationResult, RenderField } from './StepHandler'

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

export class FormStep implements StepHandler {
  readonly kind = 'form' as const

  describe(step: StepDef, ctx: StepContext, values: Answers): StepView {
    const fields: RenderField[] = (step.fields ?? []).map(f => {
      if (f.source === 'platform.services') {
        return { ...f, options: ctx.platform.services.map(s => ({ value: s.id, label: s.label })) }
      }
      return { ...f }
    })
    return {
      fields,
      actions: [{ id: 'back', label: 'Back' }, { id: 'submit', label: 'Continue', primary: true }],
    }
  }

  validate(step: StepDef, values: Answers): ValidationResult {
    const errors: Record<string, string> = {}
    for (const f of step.fields ?? []) {
      if (f.required && isEmpty(values[f.id])) errors[f.id] = `${f.label} is required`
    }
    return { ok: Object.keys(errors).length === 0, errors }
  }

  async execute(_step: StepDef, _ctx: StepContext, values: Answers): Promise<Record<string, unknown>> {
    return values
  }
}
```

```typescript
// src/steps/registry.ts
import type { StepHandler } from './StepHandler'
import type { StepKind } from '../engine/schema'
import { FormStep } from './FormStep'

export function buildRegistry(handlers: StepHandler[]): Map<StepKind, StepHandler> {
  return new Map(handlers.map(h => [h.kind, h]))
}

export const defaultHandlers = (): StepHandler[] => [new FormStep()]
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run test/steps/FormStep.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: step handler interface, FormStep, and provider seam"
```
