import * as vscode from 'vscode'
import type { WorkflowDescriptor } from '../engine/StepDescriptor'
import type { Answers } from '../tasks/context'

export interface ActionMessage {
  stepId: string
  actionId: string
  values: Answers
}

/**
 * The ONLY module permitted to call postMessage. One seam means one place to
 * log and one place to test. Enforced by ESLint. See spec Section 5.
 */
/** Generic over the descriptor so the same seam serves the panel's workflow
 *  stepper and the sidebar's setup form. */
export class WebviewBridge<D = WorkflowDescriptor> {
  private handler: ((m: ActionMessage) => void) | undefined

  /**
   * The webview's script loads asynchronously, so a render posted immediately
   * after setting the HTML arrives before anything is listening and is lost —
   * leaving a blank panel. We keep the latest descriptor and flush it when the
   * webview announces itself with `ready`.
   */
  private lastDescriptor: D | undefined
  private webviewReady = false

  /** Takes a bare Webview so the same seam serves the panel and the sidebar. */
  constructor(private readonly webview: vscode.Webview) {
    this.webview.onDidReceiveMessage((msg: { type: string } & ActionMessage) => {
      if (msg.type === 'ready') {
        this.webviewReady = true
        if (this.lastDescriptor) this.post({ type: 'render', descriptor: this.lastDescriptor })
        return
      }
      if (msg.type === 'action' && this.handler) this.handler(msg)
    })
  }

  /**
   * A hidden webview discards its DOM; when it comes back the script reloads
   * and sends `ready` again. Owners call this on hide so that flush replays the
   * current step.
   *
   * **Only for a webview that is actually discarded.** A panel created with
   * `retainContextWhenHidden` keeps its DOM and its script, so it never sends a
   * second `ready` — calling this on one silences it permanently: every later
   * `render` is stored and never posted. That is what froze the workflow panel
   * the moment anything opened over it, which a `manual` step does by design.
   */
  resetReady(): void {
    this.webviewReady = false
  }

  /**
   * Post the current descriptor again, whether or not the webview has announced
   * itself since. For an owner that shows a retained webview: cheap, idempotent,
   * and it cannot be forgotten the way a missing `ready` can.
   */
  flush(): void {
    this.webviewReady = true
    if (this.lastDescriptor) this.post({ type: 'render', descriptor: this.lastDescriptor })
  }

  onAction(cb: (m: ActionMessage) => void): void {
    this.handler = cb
  }

  render(descriptor: D): void {
    this.lastDescriptor = descriptor
    if (this.webviewReady) this.post({ type: 'render', descriptor })
  }

  private post(message: unknown): void {
    void this.webview.postMessage(message)
  }

  progress(stepId: string, message: string): void {
    this.post({ type: 'progress', stepId, message })
  }

  error(stepId: string, message: string, recoverable: boolean): void {
    this.post({ type: 'error', stepId, message, recoverable })
  }

  html(scriptUri: vscode.Uri, styleUri: vscode.Uri, nonce: string): string {
    const src = this.webview.cspSource
    return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${src}; script-src 'nonce-${nonce}'; style-src ${src};">
<link rel="stylesheet" href="${styleUri.toString()}">
</head><body><div id="root"></div>
<script nonce="${nonce}" src="${scriptUri.toString()}"></script></body></html>`
  }
}
