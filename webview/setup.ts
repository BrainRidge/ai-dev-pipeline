import { collectValues, renderStep, type StepDescriptor } from './render/fields'

/**
 * The sidebar reuses the same descriptor-driven renderer as the workflow panel.
 * Its only sidebar-specific glue is asking the host to redraw when the task
 * type changes, because which fields the form offers depends on it. Note what
 * it does NOT do: decide which task type needs which field. That stays on the
 * host, so the renderer knows no workflow by name. See spec Section 5.
 */
declare function acquireVsCodeApi(): { postMessage(msg: unknown): void }

const vscode = acquireVsCodeApi()
const root = document.getElementById('root')!

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as { type: string; descriptor?: StepDescriptor; message?: string }

  if (msg.type === 'render' && msg.descriptor) {
    const fields = msg.descriptor.step.fields ?? []
    renderStep(msg.descriptor, root, (actionId, values) =>
      vscode.postMessage({ type: 'action', stepId: 'setup', actionId, values }),
    )

    // Any choice can change which fields the form offers next — a task type
    // that wants a story key, a mode that shows saved tasks instead. The
    // renderer does not know which; it just tells the host a choice was made.
    for (const select of root.querySelectorAll<HTMLSelectElement>('select[name]')) {
      select.addEventListener('change', () =>
        vscode.postMessage({
          type: 'action',
          stepId: 'setup',
          actionId: 'refresh',
          values: collectValues(root, fields),
        }),
      )
    }
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
