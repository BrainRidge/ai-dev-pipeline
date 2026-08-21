# Task 4: The unconfigured sidebar

> Part of the [External content implementation plan](README.md).

The sidebar reloads the catalogue on every render, so it is the first thing a
developer sees fail when the setting is unset or wrong. Today `render()` has no
`try`, so a load failure would surface as an unhandled rejection and the pane
would simply stay blank.

`SetupView` imports `vscode` and cannot be unit-tested. So the descriptor shape
and the unconfigured state move into a new `vscode`-free module beside it —
following the same split the repository already makes with `SetupSelection.ts`,
which exists so the sidebar's rules can be tested without an extension host.

**The unconfigured state replaces the whole sidebar, both modes.** Continuing an
existing task looks as though it should still work, since workflows are bundled
— but resuming calls `loadCatalog`, which needs the config directory. Offering
an action that cannot succeed would be worse than offering none.

**Files:**
- Create: `src/session/setupDescriptor.ts`
- Create: `test/session/setupDescriptor.test.ts`
- Modify: `src/session/SetupView.ts` — the `SetupDescriptor` interface (deleted), `onAction`, and `render`

**Interfaces:**
- Consumes: `contentRoot()` (Task 3); `PROTOCOL_VERSION` from `src/engine/StepDescriptor.ts`
- Produces:
  - `SetupDescriptor` — **moved** from `SetupView.ts`, re-exported from it so existing imports keep working
  - `unconfiguredDescriptor(message: string): SetupDescriptor`

---

- [ ] **Step 1: Write the failing test**

Create `test/session/setupDescriptor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { unconfiguredDescriptor } from '../../src/session/setupDescriptor'
import { NOT_CONFIGURED_MESSAGE } from '../../src/content/ContentRoot'
import { PROTOCOL_VERSION } from '../../src/engine/StepDescriptor'

describe('the sidebar with no usable content root', () => {
  it('shows the message it was given rather than one of its own', () => {
    expect(unconfiguredDescriptor(NOT_CONFIGURED_MESSAGE).step.text).toBe(NOT_CONFIGURED_MESSAGE)
  })

  it('passes a load failure through verbatim, so a typo reads as a typo', () => {
    const message = 'microservices.json not found at /team/config/microservices.json'
    expect(unconfiguredDescriptor(message).step.text).toBe(message)
  })

  // Every field would be empty or wrong, and an empty microservice list can
  // never satisfy validateSetup. Offering the form would only mislead.
  it('offers no fields', () => {
    expect(unconfiguredDescriptor('x').step.fields).toEqual([])
  })

  it('offers exactly one action, and it is the fix', () => {
    expect(unconfiguredDescriptor('x').step.actions).toEqual([
      { id: 'openSettings', label: 'Open Settings', primary: true },
    ])
  })

  // Resuming needs the config directory too, so there is no half-working mode
  // to fall back to.
  it('offers no way into the existing-task mode', () => {
    const ids = unconfiguredDescriptor('x').step.fields.map((f) => f.id)
    expect(ids).not.toContain('mode')
  })

  it('carries the protocol version, so the renderer does not reject it', () => {
    expect(unconfiguredDescriptor('x').protocolVersion).toBe(PROTOCOL_VERSION)
  })

  it('has no footer, because the work directory is not the problem to solve', () => {
    expect(unconfiguredDescriptor('x').footer).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/session/setupDescriptor.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/session/setupDescriptor"`

- [ ] **Step 3: Create the vscode-free descriptor module**

Create `src/session/setupDescriptor.ts`, moving the `SetupDescriptor` interface
out of `SetupView.ts` unchanged and adding the new builder:

```typescript
import { PROTOCOL_VERSION } from '../engine/StepDescriptor'
import type { ActionDef, Answers, RenderField } from '../tasks/context'

/** The sidebar is a single form, not a workflow, so it has its own shape. */
export interface SetupDescriptor {
  protocolVersion: number
  task: { id: string; platform: string; epic: string; workflowLabel: string }
  progress: { index: number; total: number; steps: never[] }
  step: {
    id: string
    kind: string
    title: string
    fields: RenderField[]
    text?: string
    values: Answers
    errors?: Record<string, string>
    actions: ActionDef[]
  }
  /** Machine-level settings, rendered below the primary action. */
  footer?: { title?: string; fields: RenderField[]; actions: ActionDef[] }
}

/**
 * What the sidebar shows when the content root is unset, missing or invalid.
 *
 * Both modes are replaced, not just New. Continuing a task looks as though it
 * should still work, because workflows are bundled — but resuming loads the
 * config directory too, so the action would fail after the developer took it.
 *
 * The message is passed in rather than chosen here: "you have not configured
 * this" and "you have configured this wrongly" need different words, and only
 * the caller knows which happened. See spec Section 16.
 */
export function unconfiguredDescriptor(message: string): SetupDescriptor {
  return {
    protocolVersion: PROTOCOL_VERSION,
    task: { id: '', platform: '', epic: '', workflowLabel: 'Task setup' },
    progress: { index: 0, total: 0, steps: [] },
    step: {
      id: 'setup',
      kind: 'form',
      title: 'Task setup',
      fields: [],
      text: message,
      values: {},
      actions: [{ id: 'openSettings', label: 'Open Settings', primary: true }],
    },
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/session/setupDescriptor.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Use it from SetupView**

In `src/session/SetupView.ts`, delete the local `SetupDescriptor` interface
(lines 17–34) and import instead, re-exporting the type so nothing else breaks:

```typescript
import { contentRoot } from './TaskSession'
import { unconfiguredDescriptor, type SetupDescriptor } from './setupDescriptor'

export type { SetupDescriptor }
```

Replace `render()`:

```typescript
  private async render(): Promise<void> {
    if (!this.bridge) return

    const root = contentRoot()
    if (!root.ok) {
      this.bridge.render(unconfiguredDescriptor(root.message))
      return
    }

    let catalog: WorkflowCatalog
    try {
      catalog = await WorkflowCatalog.load(
        join(this.context.extensionPath, 'workflows'),
        configDirOf(root.root),
      )
    } catch (err) {
      // A missing file, malformed JSON, a duplicate shortCode. The loader's own
      // wording is the most useful thing here, so it is shown as it comes.
      this.bridge.render(unconfiguredDescriptor(err instanceof Error ? err.message : String(err)))
      return
    }

    const modeField: RenderField = {
      id: 'mode',
      type: 'select',
      label: 'Task',
      options: [
        { value: 'new', label: 'New task' },
        { value: 'existing', label: 'Continue an existing task' },
      ],
    }

    this.bridge.render(
      this.mode() === 'existing'
        ? await this.existingDescriptor(catalog, modeField)
        : this.newDescriptor(catalog, modeField),
    )
  }
```

and add the `configDirOf` import:

```typescript
import { configDirOf } from '../content/ContentRoot'
```

- [ ] **Step 6: Handle the new action**

In `SetupView.onAction`, before the `start` branch:

```typescript
    if (actionId === 'openSettings') {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'aiDevWorkflow.contentRoot',
      )
      return
    }
```

- [ ] **Step 7: Run the full gate**

Run: `npm run verify`
Expected: PASS, 426 tests

- [ ] **Step 8: Rebuild and commit**

```bash
npm run build
git add src/session/setupDescriptor.ts src/session/SetupView.ts test/ out/
git commit -m "feat(sidebar): tell the developer when the content root is unusable

Replaces the sidebar with the reason and an Open Settings action, rather
than rendering an empty form or failing silently. Moves SetupDescriptor
into a vscode-free module so the state can be unit tested. See spec
Section 16."
```
