# Task 0: The renderer's field-level action

> Part of the [Epic Browser Fetch implementation plan](README.md).

Today `RenderField` can put a button at the foot of a whole step (`step.actions`) or a whole
footer, but nothing beside one specific field. This task adds that, generically — the renderer
draws whatever `action` a field carries and reports the click the same way every other action
already is reported. It does not know that a `fetchEpic` action exists, any more than it knows
`start` or `browse` do. This keeps [invariant 1](../../spec/05-architecture.md#invariants).

Nothing later in this plan can be tested end-to-end without this existing first, but nothing in
this task depends on anything else, so it is entirely self-contained and goes first.

**Files:**
- Modify: `src/tasks/context.ts` — `RenderField`
- Modify: `webview/render/fields.ts` — mirrored `RenderField`, and `renderField`
- Modify: `test/webview` (existing renderer fixtures/tests, wherever `renderField` is exercised)

**Interfaces:**
- Produces: `RenderField.action?: { id: string; label: string }`

---

- [ ] **Step 1: Add the property to both copies of `RenderField`**

In `src/tasks/context.ts`:

```typescript
export interface RenderField extends FieldDef {
  options?: { value: string; label: string }[]
  /** A single button drawn inline beside the field. Fires like any step action. */
  action?: { id: string; label: string }
}
```

In `webview/render/fields.ts`, add the same property to its independent copy of the interface
(it deliberately does not import from `src/tasks/context.ts` — see the Global Constraints in
[README.md](README.md)):

```typescript
export interface RenderField {
  id: string
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'boolean' | 'repo-picker' | 'file-picker'
  label: string
  required?: boolean
  options?: { value: string; label: string }[]
  /** A single button drawn inline beside the field. Fires like any step action. */
  action?: { id: string; label: string }
}
```

- [ ] **Step 2: Draw it, and report the click**

`renderField` currently takes no way to report a click of its own — the caller
(`renderStep`/`renderWorkflow`) reads the form values only when its own action buttons fire.
Give `renderField` an optional callback so the field's own button can report immediately,
without waiting for the developer to press Continue:

```typescript
export function renderField(
  field: RenderField,
  value: unknown,
  error?: string,
  onFieldAction?: (actionId: string) => void,
): HTMLElement {
  const wrap = el('div', 'field')

  const labelRow = el('div', 'field-label-row')
  labelRow.append(el('label', 'field-label', field.label))
  if (field.action) {
    const button = el('button', 'field-action', field.action.label)
    button.type = 'button'
    button.addEventListener('click', () => onFieldAction?.(field.action!.id))
    labelRow.append(button)
  }
  wrap.append(labelRow)

  // ...unchanged switch over field.type...
```

(This replaces the current single `wrap.append(el('label', 'field-label', field.label))` line
with the `labelRow` built above.)

- [ ] **Step 3: Thread the callback through `renderStep`**

`renderStep` in `webview/render/fields.ts` is the only caller relevant to this plan (the sidebar
uses it, not `renderWorkflow`). Where it currently does:

```typescript
for (const f of d.step.fields ?? []) {
  body.append(renderField(f, d.step.values[f.id], d.step.errors?.[f.id]))
}
```

change to:

```typescript
for (const f of d.step.fields ?? []) {
  body.append(
    renderField(f, d.step.values[f.id], d.step.errors?.[f.id], (actionId) =>
      onAction?.(actionId, collect()),
    ),
  )
}
```

`collect` is already defined further down in the same function; hoist its declaration (or the
function expression) above this loop so it is in scope here. It already gathers every field's
current value, including the one whose button was just pressed, so `SetupView` sees the epic
key the developer actually typed, not a stale one from the last render.

- [ ] **Step 4: A style for the inline button**

Add to the sidebar's inline `<style>` in `src/session/SetupView.ts`'s `html()` (the sidebar
carries its own stylesheet — see spec Section 9):

```css
.field-label-row{display:flex;align-items:center;justify-content:space-between;gap:.5rem}
.field-action{width:auto;padding:.15rem .5rem;font-size:.8em;background:var(--vscode-button-secondaryBackground,rgba(127,127,127,.2));color:var(--vscode-button-secondaryForeground,inherit)}
```

- [ ] **Step 5: Tests**

Extend the existing renderer test(s) for `renderField`/`renderStep` (`test/webview/…`) with
cases for: a field with no `action` draws no button (existing fields must render unchanged); a
field with an `action` draws a button labelled correctly; clicking it calls `onAction` with that
action's id and the current form values, without requiring the step's own primary action to be
pressed first.

- [ ] **Step 6: Run the full gate**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 7: Rebuild and commit**

```bash
npm run build
git add src/tasks/context.ts webview/render/fields.ts src/session/SetupView.ts test/ out/
git commit -m "feat(renderer): a field can carry its own inline action

Generic — the renderer draws whatever action a field declares and
reports the click like any other action. Nothing here knows what any
action id means; SetupView gives fetchEpic its meaning in a later
task. See spec Section 19."
```
