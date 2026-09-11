import { renderWorkflow, type WorkflowDescriptor } from './render/fields'

const EXPECTED_PROTOCOL = 2

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void }

const vscode = acquireVsCodeApi()
const root = document.getElementById('root')!

function banner(cls: string, text: string): void {
  const existing = root.querySelector(`.${cls}`)
  if (existing) existing.remove()
  const box = document.createElement('div')
  box.className = cls
  box.textContent = text
  root.prepend(box)
}

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as { type: string } & Record<string, unknown>

  if (msg.type === 'render') {
    const d = msg.descriptor as WorkflowDescriptor
    // Extension versions drift across a large team, so a mismatch must fail
    // legibly rather than unpredictably. See spec Section 9.
    if (d.protocolVersion !== EXPECTED_PROTOCOL) {
      root.textContent = 'This panel is out of date. Please reload the window.'
      return
    }
    renderWorkflow(d, root, (stepId, actionId, values) =>
      vscode.postMessage({ type: 'action', stepId, actionId, values }),
    )
    return
  }

  if (msg.type === 'progress') {
    banner('progress-message', String(msg.message))
    return
  }

  if (msg.type === 'error') {
    banner('error-box', String(msg.message))
  }
})

vscode.postMessage({ type: 'ready' })
