# Task 9: The renderer

> Part of the [Phase 1 implementation plan](README.md). Completed and shipped.

**Files:**
- Create: `webview/main.ts`, `webview/render/fields.ts`, `webview/style.css`
- Create: `webview/fixtures/form-step.json`, `webview/fixtures/dev.html`
- Test: `test/webview/fields.test.ts`

**Interfaces:**
- Consumes: `StepDescriptor` shape (Task 8) — **by structure only, never by import**, per the ESLint boundary
- Produces: `renderField(f: RenderField, value: unknown): HTMLElement`, `renderStep(d: StepDescriptor, root: HTMLElement): void`

- [ ] **Step 1: Write the failing renderer test**

```typescript
// test/webview/fields.test.ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderField, renderStep } from '../../webview/render/fields'

describe('renderField', () => {
  it('renders a textarea for type textarea', () => {
    const el = renderField({ id: 'q', type: 'textarea', label: 'Question' }, 'why')
    expect(el.querySelector('textarea')!.value).toBe('why')
  })

  it('renders one checkbox per option for multiselect', () => {
    const el = renderField({ id: 's', type: 'multiselect', label: 'Services',
      options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }, ['a'])
    const boxes = el.querySelectorAll<HTMLInputElement>('input[type=checkbox]')
    expect(boxes).toHaveLength(2)
    expect(boxes[0]!.checked).toBe(true)
    expect(boxes[1]!.checked).toBe(false)
  })

  it('marks a required field', () => {
    const el = renderField({ id: 'q', type: 'text', label: 'Q', required: true }, '')
    expect(el.querySelector('input')!.required).toBe(true)
  })

  it('shows an error message when present', () => {
    const el = renderField({ id: 'q', type: 'text', label: 'Q' }, '', 'Q is required')
    expect(el.textContent).toContain('Q is required')
  })
})

describe('renderStep', () => {
  const descriptor = {
    protocolVersion: 1,
    task: { id: 'T', platform: 'p', epic: 'E', workflowLabel: 'Research Task' },
    progress: { index: 1, total: 2, steps: [
      { id: 'a', title: 'A', status: 'current' }, { id: 'b', title: 'B', status: 'pending' }] },
    step: { id: 'a', kind: 'form', title: 'A', values: {},
            fields: [{ id: 'q', type: 'text', label: 'Q' }],
            actions: [{ id: 'submit', label: 'Continue', primary: true }] },
  }

  it('renders exactly the actions it is given', () => {
    const root = document.createElement('div')
    renderStep(descriptor as never, root)
    const buttons = [...root.querySelectorAll('button')].map(b => b.textContent)
    expect(buttons).toEqual(['Continue'])
  })

  it('renders the progress list', () => {
    const root = document.createElement('div')
    renderStep(descriptor as never, root)
    expect(root.querySelectorAll('[data-step-id]')).toHaveLength(2)
  })
})
```

Add `jsdom` to devDependencies and `environment` support: `npm i -D jsdom`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/webview/fields.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `webview/render/fields.ts`**

```typescript
export interface RenderField {
  id: string
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'boolean' | 'repo-picker' | 'file-picker'
  label: string
  required?: boolean
  options?: { value: string; label: string }[]
}

export interface StepDescriptor {
  protocolVersion: number
  task: { id: string; platform: string; epic: string; workflowLabel: string }
  progress: { index: number; total: number
            ; steps: { id: string; title: string; status: string }[] }
  step: { id: string; kind: string; title: string; fields?: RenderField[]; text?: string
        ; values: Record<string, unknown>; errors?: Record<string, string>
        ; actions: { id: string; label: string; primary?: boolean }[] }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text) node.textContent = text
  return node
}

export function renderField(field: RenderField, value: unknown, error?: string): HTMLElement {
  const wrap = el('div', 'field')
  wrap.append(el('label', 'field-label', field.label))

  switch (field.type) {
    case 'textarea': {
      const t = el('textarea')
      t.name = field.id; t.value = String(value ?? ''); t.required = Boolean(field.required)
      wrap.append(t)
      break
    }
    case 'multiselect': {
      const selected = new Set(Array.isArray(value) ? value.map(String) : [])
      const group = el('div', 'options')
      for (const opt of field.options ?? []) {
        const line = el('label', 'option')
        const box = el('input')
        box.type = 'checkbox'; box.name = field.id; box.value = opt.value
        box.checked = selected.has(opt.value)
        line.append(box, document.createTextNode(opt.label))
        group.append(line)
      }
      wrap.append(group)
      break
    }
    case 'select': {
      const s = el('select')
      s.name = field.id
      for (const opt of field.options ?? []) {
        const o = el('option'); o.value = opt.value; o.textContent = opt.label
        o.selected = opt.value === value
        s.append(o)
      }
      wrap.append(s)
      break
    }
    case 'boolean': {
      const b = el('input'); b.type = 'checkbox'; b.name = field.id; b.checked = Boolean(value)
      wrap.append(b)
      break
    }
    default: {
      const i = el('input')
      i.type = 'text'; i.name = field.id; i.value = String(value ?? '')
      i.required = Boolean(field.required)
      wrap.append(i)
    }
  }

  if (error) wrap.append(el('div', 'field-error', error))
  return wrap
}

export function collectValues(root: HTMLElement, fields: RenderField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    if (f.type === 'multiselect') {
      out[f.id] = [...root.querySelectorAll<HTMLInputElement>(`input[name="${f.id}"]:checked`)]
        .map(b => b.value)
    } else if (f.type === 'boolean') {
      out[f.id] = root.querySelector<HTMLInputElement>(`input[name="${f.id}"]`)?.checked ?? false
    } else {
      out[f.id] = root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        `[name="${f.id}"]`)?.value ?? ''
    }
  }
  return out
}

export function renderStep(
  d: StepDescriptor, root: HTMLElement,
  onAction?: (actionId: string, values: Record<string, unknown>) => void,
): void {
  root.textContent = ''

  const header = el('header', 'task-header')
  header.append(el('h1', undefined, d.step.title))
  header.append(el('p', 'task-meta',
    `${d.task.workflowLabel} · ${d.task.epic} · step ${d.progress.index} of ${d.progress.total}`))
  root.append(header)

  const nav = el('ol', 'progress')
  for (const s of d.progress.steps) {
    const li = el('li', `progress-item ${s.status}`, s.title)
    li.setAttribute('data-step-id', s.id)
    nav.append(li)
  }
  root.append(nav)

  const body = el('div', 'step-body')
  if (d.step.text) body.append(el('p', 'step-text', d.step.text))
  for (const f of d.step.fields ?? []) {
    body.append(renderField(f, d.step.values[f.id], d.step.errors?.[f.id]))
  }
  root.append(body)

  const actions = el('div', 'actions')
  for (const a of d.step.actions) {
    const b = el('button', a.primary ? 'primary' : undefined, a.label)
    b.addEventListener('click', () => onAction?.(a.id, collectValues(body, d.step.fields ?? [])))
    actions.append(b)
  }
  root.append(actions)
}
```

- [ ] **Step 4: Run the renderer test**

Run: `npx vitest run test/webview/fields.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Implement `webview/main.ts` and the browser dev harness**

```typescript
// webview/main.ts
import { renderStep, type StepDescriptor } from './render/fields'

const EXPECTED_PROTOCOL = 1
declare function acquireVsCodeApi(): { postMessage(msg: unknown): void }
const vscode = acquireVsCodeApi()
const root = document.getElementById('root')!

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as { type: string } & Record<string, unknown>

  if (msg.type === 'render') {
    const d = msg.descriptor as StepDescriptor
    if (d.protocolVersion !== EXPECTED_PROTOCOL) {
      root.textContent = 'This panel is out of date. Please reload the window.'
      return
    }
    renderStep(d, root, (actionId, values) =>
      vscode.postMessage({ type: 'action', stepId: d.step.id, actionId, values }))
    return
  }

  if (msg.type === 'progress') {
    const bar = document.createElement('div')
    bar.className = 'progress-message'
    bar.textContent = String(msg.message)
    root.prepend(bar)
    return
  }

  if (msg.type === 'error') {
    const box = document.createElement('div')
    box.className = 'error-box'
    box.textContent = String(msg.message)
    root.prepend(box)
  }
})

vscode.postMessage({ type: 'ready' })
```

Create `webview/fixtures/form-step.json` containing the descriptor from the test above, and `webview/fixtures/dev.html`:

```html
<!DOCTYPE html>
<html><head><link rel="stylesheet" href="../style.css"></head>
<body><div id="root"></div>
<script type="module">
  import { renderStep } from '../render/fields.ts'
  const d = await (await fetch('./form-step.json')).json()
  renderStep(d, document.getElementById('root'), (a, v) => console.log(a, v))
</script></body></html>
```

This is what lets a tool developer iterate on the UI in a browser with no extension host running.

- [ ] **Step 6: Write `webview/style.css` using theme variables only**

```css
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
       background: var(--vscode-editor-background); padding: 1rem; }
.task-meta { color: var(--vscode-descriptionForeground); font-size: .9em; }
.progress { list-style: none; padding: 0; display: flex; gap: .5rem; flex-wrap: wrap; }
.progress-item { padding: .2rem .5rem; border-radius: 3px;
                 background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
.progress-item.current { outline: 1px solid var(--vscode-focusBorder); }
.progress-item.pending { opacity: .5; }
.field { margin: 1rem 0; display: flex; flex-direction: column; gap: .3rem; }
.field-label { font-weight: 600; }
input[type=text], textarea, select {
  background: var(--vscode-input-background); color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, transparent); padding: .4rem; font: inherit; }
textarea { min-height: 6rem; }
.field-error { color: var(--vscode-inputValidation-errorForeground, #f88); font-size: .9em; }
.actions { display: flex; gap: .5rem; margin-top: 1.5rem; }
button { font: inherit; padding: .4rem 1rem; cursor: pointer;
         background: var(--vscode-button-secondaryBackground);
         color: var(--vscode-button-secondaryForeground); border: none; }
button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
```

- [ ] **Step 7: Confirm the renderer boundary holds**

Temporarily add `import { PROTOCOL_VERSION } from '../src/engine/StepDescriptor'` to `webview/main.ts`.

Run: `npm run lint`
Expected: FAIL with "The renderer must not import extension-host code."

Remove it and re-run. Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: generic webview renderer with browser dev harness"
```
