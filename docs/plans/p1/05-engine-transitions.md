# Task 5: WorkflowEngine transitions

> Part of the [Phase 1 implementation plan](README.md). Completed and shipped.

**Files:**
- Create: `src/engine/WorkflowEngine.ts`, `src/engine/when.ts`
- Test: `test/engine/when.test.ts`, `test/engine/WorkflowEngine.test.ts`

**Interfaces:**
- Consumes: `WorkflowDef`, `TaskState`, `TaskStateStore`, `StepHandler` registry
- Produces: `new WorkflowEngine(wf, store, registry, ctx)`, `engine.current(): Promise<StepDef>`, `engine.submit(stepId, actionId, values): Promise<TransitionResult>`
- Produces: `type TransitionResult = { ok: true; done: boolean } | { ok: false; errors: Record<string,string> }`
- Produces: `evaluateWhen(expr: string, lookup: (ns: string, field: string) => unknown): boolean`

- [ ] **Step 1: Write the failing `when` test**

```typescript
// test/engine/when.test.ts
import { describe, it, expect } from 'vitest'
import { evaluateWhen } from '../../src/engine/when'

const lookup = (ns: string, f: string) =>
  ({ design: { exists: false, owner: 'ana' } } as Record<string, Record<string, unknown>>)[ns]?.[f]

describe('evaluateWhen', () => {
  it('compares against a boolean literal', () => {
    expect(evaluateWhen('design.exists == false', lookup)).toBe(true)
    expect(evaluateWhen('design.exists == true', lookup)).toBe(false)
  })

  it('compares against a string literal', () => {
    expect(evaluateWhen('design.owner == "ana"', lookup)).toBe(true)
  })

  it('supports !=', () => {
    expect(evaluateWhen('design.owner != "bob"', lookup)).toBe(true)
  })

  it('rejects anything more complex than one comparison', () => {
    expect(() => evaluateWhen('a.b == 1 && c.d == 2', lookup)).toThrow(/grammar/i)
    expect(() => evaluateWhen('a.b > 1', lookup)).toThrow(/grammar/i)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/engine/when.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/engine/when.ts`**

The grammar is deliberately minimal and **must not be extended** — see spec Section 6.

```typescript
const GRAMMAR = /^\s*([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\s*(==|!=)\s*(".*"|'.*'|true|false|-?\d+)\s*$/

export function evaluateWhen(expr: string, lookup: (ns: string, field: string) => unknown): boolean {
  const m = GRAMMAR.exec(expr)
  if (!m) {
    throw new Error(
      `"${expr}" is outside the when grammar. Only one comparison is allowed: ` +
      `<step>.<field> == <literal>. Split the workflow instead of extending the grammar.`,
    )
  }
  const [, ns, field, op, rawLiteral] = m
  const literal = parseLiteral(rawLiteral!)
  const actual = lookup(ns!, field!)
  return op === '==' ? actual === literal : actual !== literal
}

function parseLiteral(raw: string): unknown {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (/^-?\d+$/.test(raw)) return Number(raw)
  return raw.slice(1, -1)
}
```

- [ ] **Step 4: Run the `when` test**

Run: `npx vitest run test/engine/when.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing engine test**

```typescript
// test/engine/WorkflowEngine.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkflowEngine } from '../../src/engine/WorkflowEngine'
import { TaskStateStore } from '../../src/state/TaskStateStore'
import { buildRegistry } from '../../src/steps/registry'
import { FormStep } from '../../src/steps/FormStep'
import type { WorkflowDef } from '../../src/engine/schema'

const wf: WorkflowDef = {
  id: 'research', label: 'Research', platforms: ['p'],
  steps: [
    { id: 'scope',  kind: 'form', title: 'Scope',
      fields: [{ id: 'question', type: 'textarea', label: 'Q', required: true }] },
    { id: 'notes',  kind: 'form', title: 'Notes', when: 'scope.question != "skip"',
      fields: [{ id: 'n', type: 'text', label: 'N' }] },
    { id: 'review', kind: 'form', title: 'Review', onRevise: 'scope',
      fields: [{ id: 'ok', type: 'boolean', label: 'OK' }] },
  ],
}

const platform = { id: 'p', label: 'P', services: [] }

async function engine() {
  const dir = await mkdtemp(join(tmpdir(), 'eng-'))
  const store = new TaskStateStore(dir)
  await store.write({
    schemaVersion: 1, taskId: 't', workflowId: 'research', platform: 'p', epic: 'E',
    currentStepId: 'scope', workflowHash: 'h', steps: {},
  })
  return new WorkflowEngine(wf, store, buildRegistry([new FormStep()]),
    { platform, taskDir: dir, answersOf: () => ({}) })
}

describe('WorkflowEngine', () => {
  it('starts at the first step', async () => {
    expect((await (await engine()).current()).id).toBe('scope')
  })

  it('rejects an invalid submission and does not advance', async () => {
    const e = await engine()
    const r = await e.submit('scope', 'submit', { question: '' })
    expect(r.ok).toBe(false)
    expect((await e.current()).id).toBe('scope')
  })

  it('advances on a valid submission', async () => {
    const e = await engine()
    expect((await e.submit('scope', 'submit', { question: 'why' })).ok).toBe(true)
    expect((await e.current()).id).toBe('notes')
  })

  it('skips a step whose when evaluates false', async () => {
    const e = await engine()
    await e.submit('scope', 'submit', { question: 'skip' })
    expect((await e.current()).id).toBe('review')
  })

  it('loops back to onRevise target', async () => {
    const e = await engine()
    await e.submit('scope', 'submit', { question: 'skip' })
    await e.submit('review', 'revise', {})
    expect((await e.current()).id).toBe('scope')
  })

  it('persists state across a fresh engine instance', async () => {
    const e = await engine()
    await e.submit('scope', 'submit', { question: 'why' })
    const reloaded = new WorkflowEngine(wf, (e as any).store, buildRegistry([new FormStep()]),
      { platform, taskDir: '', answersOf: () => ({}) })
    expect((await reloaded.current()).id).toBe('notes')
  })
})
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npx vitest run test/engine/WorkflowEngine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `src/engine/WorkflowEngine.ts`**

```typescript
import type { WorkflowDef, StepDef, StepKind } from './schema'
import type { TaskStateStore, TaskState } from '../state/TaskStateStore'
import type { Answers, StepContext, StepHandler } from '../steps/StepHandler'
import { evaluateWhen } from './when'

export type TransitionResult =
  | { ok: true; done: boolean }
  | { ok: false; errors: Record<string, string> }

export class WorkflowEngine {
  constructor(
    private readonly workflow: WorkflowDef,
    private readonly store: TaskStateStore,
    private readonly registry: Map<StepKind, StepHandler>,
    private readonly ctx: StepContext,
  ) {}

  async state(): Promise<TaskState> { return this.store.read() }

  async current(): Promise<StepDef> {
    const s = await this.store.read()
    return this.stepById(s.currentStepId)
  }

  async submit(stepId: string, actionId: string, values: Answers): Promise<TransitionResult> {
    const state = await this.store.read()
    const step = this.stepById(stepId)
    const handler = this.handlerFor(step.kind)

    if (actionId === 'revise' && step.onRevise) {
      state.currentStepId = step.onRevise
      state.steps[step.id] = { status: 'pending' }
      await this.store.write(state)
      return { ok: true, done: false }
    }

    if (actionId === 'back') {
      const prev = this.previousVisible(step.id, state)
      if (prev) { state.currentStepId = prev.id; await this.store.write(state) }
      return { ok: true, done: false }
    }

    const validation = handler.validate(step, values)
    if (!validation.ok) return { ok: false, errors: validation.errors }

    const result = await handler.execute(step, this.ctx, values)
    state.steps[step.id] = { status: 'complete', answers: values, result }

    const next = this.nextVisible(step.id, state)
    state.currentStepId = next ? next.id : step.id
    await this.store.write(state)          // persisted BEFORE the caller sees the transition
    return { ok: true, done: next === undefined }
  }

  private stepById(id: string): StepDef {
    const s = this.workflow.steps.find(x => x.id === id)
    if (!s) throw new Error(`unknown step: ${id}`)
    return s
  }

  private handlerFor(kind: StepKind): StepHandler {
    const h = this.registry.get(kind)
    if (!h) throw new Error(`no handler registered for step kind: ${kind}`)
    return h
  }

  private visible(step: StepDef, state: TaskState): boolean {
    if (!step.when) return true
    return evaluateWhen(step.when, (ns, field) => state.steps[ns]?.answers?.[field])
  }

  private nextVisible(fromId: string, state: TaskState): StepDef | undefined {
    const i = this.workflow.steps.findIndex(s => s.id === fromId)
    return this.workflow.steps.slice(i + 1).find(s => this.visible(s, state))
  }

  private previousVisible(fromId: string, state: TaskState): StepDef | undefined {
    const i = this.workflow.steps.findIndex(s => s.id === fromId)
    return [...this.workflow.steps.slice(0, i)].reverse().find(s => this.visible(s, state))
  }
}
```

- [ ] **Step 8: Run the engine test**

Run: `npx vitest run test/engine/WorkflowEngine.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: workflow engine transitions with when and onRevise"
```
