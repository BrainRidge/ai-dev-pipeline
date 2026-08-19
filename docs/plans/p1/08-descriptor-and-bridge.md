# Task 8: Step descriptor and webview bridge

> Part of the [Phase 1 implementation plan](README.md). Completed and shipped.

**Files:**
- Create: `src/engine/StepDescriptor.ts`, `src/bridge/WebviewBridge.ts`
- Test: `test/engine/StepDescriptor.test.ts`

**Interfaces:**
- Consumes: `WorkflowEngine`, `StepHandler.describe`
- Produces:
  ```typescript
  const PROTOCOL_VERSION = 1
  interface StepDescriptor {
    protocolVersion: number
    task: { id: string; platform: string; epic: string; workflowLabel: string }
    progress: { index: number; total: number
              ; steps: { id: string; title: string; status: 'pending'|'current'|'complete' }[] }
    step: { id: string; kind: StepKind; title: string
          ; fields?: RenderField[]; text?: string
          ; values: Answers; errors?: Record<string,string>; actions: ActionDef[] }
  }
  function buildDescriptor(args): StepDescriptor
  ```
- Produces: `new WebviewBridge(panel)`, `bridge.render(d)`, `bridge.progress(stepId, msg)`, `bridge.error(stepId, msg, recoverable)`, `bridge.onAction(cb)`

- [ ] **Step 1: Write the failing descriptor test**

```typescript
// test/engine/StepDescriptor.test.ts
import { describe, it, expect } from 'vitest'
import { buildDescriptor, PROTOCOL_VERSION } from '../../src/engine/StepDescriptor'
import { FormStep } from '../../src/steps/FormStep'
import type { WorkflowDef } from '../../src/engine/schema'
import type { TaskState } from '../../src/state/TaskStateStore'

const wf: WorkflowDef = {
  id: 'research', label: 'Research Task', platforms: ['p'],
  steps: [
    { id: 'scope',   kind: 'form', title: 'Scope',   fields: [{ id: 'q', type: 'text', label: 'Q' }] },
    { id: 'context', kind: 'form', title: 'Context', fields: [{ id: 'c', type: 'text', label: 'C' }] },
    { id: 'review',  kind: 'form', title: 'Review',  fields: [] },
  ],
}
const state: TaskState = {
  schemaVersion: 1, taskId: 'T-1', workflowId: 'research', platform: 'canada-assisted',
  epic: 'PLAT-1', currentStepId: 'context', workflowHash: 'h',
  steps: { scope: { status: 'complete', answers: { q: 'why' } }, context: { status: 'in_progress' } },
}
const ctx = { platform: { id: 'p', label: 'P', services: [] }, taskDir: '/t', answersOf: () => ({}) }

describe('buildDescriptor', () => {
  const d = buildDescriptor({ workflow: wf, state, handler: new FormStep(), ctx, values: {}, errors: {} })

  it('stamps the protocol version', () => {
    expect(d.protocolVersion).toBe(PROTOCOL_VERSION)
  })

  it('reports progress with per-step status', () => {
    expect(d.progress).toMatchObject({ index: 2, total: 3 })
    expect(d.progress.steps.map(s => s.status)).toEqual(['complete', 'current', 'pending'])
  })

  it('carries task identity for the header', () => {
    expect(d.task).toEqual({ id: 'T-1', platform: 'canada-assisted',
                             epic: 'PLAT-1', workflowLabel: 'Research Task' })
  })

  it('includes actions declared by the handler, not by the renderer', () => {
    expect(d.step.actions.map(a => a.id)).toEqual(['back', 'submit'])
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/engine/StepDescriptor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/engine/StepDescriptor.ts`**

```typescript
import type { WorkflowDef, StepKind } from './schema'
import type { TaskState } from '../state/TaskStateStore'
import type { Answers, ActionDef, RenderField, StepContext, StepHandler } from '../steps/StepHandler'

export const PROTOCOL_VERSION = 1

export interface StepDescriptor {
  protocolVersion: number
  task: { id: string; platform: string; epic: string; workflowLabel: string }
  progress: {
    index: number
    total: number
    steps: { id: string; title: string; status: 'pending' | 'current' | 'complete' }[]
  }
  step: {
    id: string
    kind: StepKind
    title: string
    fields?: RenderField[]
    text?: string
    values: Answers
    errors?: Record<string, string>
    actions: ActionDef[]
  }
}

export function buildDescriptor(args: {
  workflow: WorkflowDef
  state: TaskState
  handler: StepHandler
  ctx: StepContext
  values: Answers
  errors: Record<string, string>
}): StepDescriptor {
  const { workflow, state, handler, ctx, values, errors } = args
  const step = workflow.steps.find(s => s.id === state.currentStepId)!
  const view = handler.describe(step, ctx, values)

  return {
    protocolVersion: PROTOCOL_VERSION,
    task: {
      id: state.taskId, platform: state.platform,
      epic: state.epic, workflowLabel: workflow.label,
    },
    progress: {
      index: workflow.steps.findIndex(s => s.id === step.id) + 1,
      total: workflow.steps.length,
      steps: workflow.steps.map(s => ({
        id: s.id, title: s.title,
        status: s.id === step.id ? 'current'
              : state.steps[s.id]?.status === 'complete' ? 'complete' : 'pending',
      })),
    },
    step: {
      id: step.id, kind: step.kind, title: step.title,
      fields: view.fields, text: view.text,
      values, errors: Object.keys(errors).length ? errors : undefined,
      actions: view.actions,
    },
  }
}
```

- [ ] **Step 4: Run the descriptor test**

Run: `npx vitest run test/engine/StepDescriptor.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement `src/bridge/WebviewBridge.ts`**

This is the **only** module permitted to call `postMessage` — the ESLint rule from Task 1 enforces it.

```typescript
import * as vscode from 'vscode'
import type { StepDescriptor } from '../engine/StepDescriptor'
import type { Answers } from '../steps/StepHandler'

export interface ActionMessage { stepId: string; actionId: string; values: Answers }

export class WebviewBridge {
  private handler: ((m: ActionMessage) => void) | undefined

  constructor(private readonly panel: vscode.WebviewPanel) {
    this.panel.webview.onDidReceiveMessage((msg: { type: string } & ActionMessage) => {
      if (msg.type === 'action' && this.handler) this.handler(msg)
    })
  }

  onAction(cb: (m: ActionMessage) => void): void { this.handler = cb }

  render(descriptor: StepDescriptor): void {
    void this.panel.webview.postMessage({ type: 'render', descriptor })
  }

  progress(stepId: string, message: string): void {
    void this.panel.webview.postMessage({ type: 'progress', stepId, message })
  }

  error(stepId: string, message: string, recoverable: boolean): void {
    void this.panel.webview.postMessage({ type: 'error', stepId, message, recoverable })
  }

  html(scriptUri: vscode.Uri, nonce: string): string {
    return `<!DOCTYPE html><html><head>
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
</head><body><div id="root"></div>
<script nonce="${nonce}" src="${scriptUri}"></script></body></html>`
  }
}
```

- [ ] **Step 6: Verify the lint boundary actually bites**

Temporarily add `void panel.webview.postMessage({})` to `src/engine/WorkflowEngine.ts`.

Run: `npm run lint`
Expected: FAIL with "Only WebviewBridge may call postMessage."

Remove the line and re-run. Expected: clean. This confirms the rule is real rather than decorative.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: step descriptor and webview bridge"
```
