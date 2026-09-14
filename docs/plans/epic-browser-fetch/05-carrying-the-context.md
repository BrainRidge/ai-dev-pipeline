# Task 5: Carrying the result into the workflow

> Part of the [Epic Browser Fetch implementation plan](README.md).

[Task 4](04-setup-view-wiring.md) leaves the fetched text sitting in `SetupView`'s own
`this.values.epicContext` — gone the moment the task starts, unless something carries it
forward. This task is that path, all the way to `CollectRequirement`'s story field, and it is
kept separate from Task 4 because everything in it is `vscode`-free and independently testable,
unlike `SetupView` itself.

**The mechanism, precisely:** `TaskType.describe` currently has no way to influence the values
a fresh step shows — `StepDescriptor.ts` computes those generically, as either what the
developer has typed or what a completed step already answered
([`src/engine/StepDescriptor.ts:165`](../../../src/engine/StepDescriptor.ts)), and a step with
neither has always shown an empty form. `initialValues` is a third source, lowest priority,
supplied by the taskType itself. `StepDescriptor.ts` merges it without knowing why any taskType
would want one — the same separation Task 0 keeps for the renderer.

**Files:**
- Modify: `src/session/SetupSelection.ts` — `SetupSelection.epicContext`
- Modify: `src/session/TaskSession.ts` — `inputs.epicContext`, conditionally
- Modify: `src/tasks/TaskType.ts` — `TaskView.initialValues`
- Modify: `src/engine/StepDescriptor.ts` — merge `initialValues` under `prefill`
- Modify: `src/tasks/CollectRequirement.ts` — set `initialValues.story`
- Modify: `test/session/*`, `test/engine/StepDescriptor.test.ts`, `test/tasks/CollectRequirement.test.ts`

---

- [ ] **Step 1: `SetupSelection` gains the field**

In `src/session/SetupSelection.ts`, add `epicContext: string` to the interface, alongside
`epic`. It needs no entry in `validateSetup` — an empty fetch or no fetch at all are both fine,
since the story field stays free entry either way — and in `normaliseSetup`, trim it the same
way `featureStory` is trimmed.

- [ ] **Step 2: `SetupView.selection()` reads it back**

In `src/session/SetupView.ts`'s `selection()` (already modified in Task 4's neighbourhood):

```typescript
epicContext: String(this.values.epicContext ?? ''),
```

- [ ] **Step 3: Into `TaskState.inputs`, conditionally**

In `src/session/TaskSession.ts`'s `startWith`, beside the existing:

```typescript
if (selection.featureStory) inputs.featureStory = selection.featureStory
```

add:

```typescript
if (selection.epicContext) inputs.epicContext = selection.epicContext
```

No `TaskState` schema change — `inputs` is already `Record<string, unknown>`
(`src/state/TaskStateStore.ts`) and every step already reads task-level facts through it via
`{{task.<id>}}` ([`src/engine/placeholders.ts`](../../../src/engine/placeholders.ts)), which
resolves an unrecognised field name straight from `ctx.inputs`. So `{{task.epicContext}}` is
usable in a prompt template from this step onward with no further change, if a workflow author
ever wants that.

- [ ] **Step 4: `TaskView.initialValues`**

In `src/tasks/TaskType.ts`:

```typescript
export interface TaskView {
  fields?: RenderField[]
  text?: string
  commands?: CommandBlock[]
  actions: ActionDef[]
  /** Shown only until the developer types something, or a saved answer exists. */
  initialValues?: Answers
}
```

- [ ] **Step 5: `StepDescriptor.ts` merges it in, lowest priority**

In `src/engine/StepDescriptor.ts`, the active step currently does:

```typescript
const view: TaskView = await task.describe(step, ctx, prefill)
```
```typescript
return {
  ...base,
  fields: view.fields,
  text: view.text,
  commands: view.commands,
  values: prefill,
  ...
}
```

Change the final object's `values` to fold in `view.initialValues` beneath `prefill`:

```typescript
values: { ...view.initialValues, ...prefill },
```

Because `prefill` is `{}` only on a step's very first, unanswered render (Step 1 of this task's
description above), `initialValues` is visible exactly once — the moment the developer first
sees the field — and disappears the instant they type anything or the step is submitted and
revisited, since `prefill` then carries real answers that override it.

- [ ] **Step 6: `CollectRequirement` sets it**

In `src/tasks/CollectRequirement.ts`'s `describe`:

```typescript
async describe(_step: StepDef, ctx: StepContext, _values: Answers): Promise<TaskView> {
  const epicContext = String(ctx.inputs.epicContext ?? '')
  return {
    fields: await Promise.all(this.fields.map((field) => this.offer(field))),
    initialValues: epicContext ? { story: epicContext } : undefined,
    actions: [
      { id: 'back', label: 'Back' },
      { id: 'submit', label: 'Continue', primary: true },
    ],
  }
}
```

(`describe`'s second parameter, previously unused and named `_ctx`, is now read — rename it to
`ctx`.)

- [ ] **Step 7: Tests**

- `test/session/SetupSelection.test.ts` (or wherever `normaliseSetup`/`validateSetup` are
  covered today): `epicContext` trims like `featureStory`; an empty one is not an error.
- `test/engine/StepDescriptor.test.ts`: a taskType returning `initialValues` shows them when
  `prefill` is empty, and *not* when the developer has typed something or the step has already
  answered — three cases, matching the priority described in Step 5 above.
- `test/tasks/CollectRequirement.test.ts`: `describe` returns
  `initialValues: { story: ctx.inputs.epicContext }` when set, and `undefined` when it is not,
  so an ordinary manual-entry task (no fetch ever used) is provably unchanged.

- [ ] **Step 8: Run the full gate**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 9: Rebuild and commit**

```bash
npm run build
git add src/session/SetupSelection.ts src/session/TaskSession.ts src/session/SetupView.ts \
        src/tasks/TaskType.ts src/engine/StepDescriptor.ts src/tasks/CollectRequirement.ts \
        test/ out/
git commit -m "feat(workflow): a fetched epic prefills the story field

TaskView gains initialValues, lowest priority under whatever the
developer has actually typed or already answered — a generic
mechanism, not epic-specific; CollectRequirement is its first user.
See spec Section 19."
```
