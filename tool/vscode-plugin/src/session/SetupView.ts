import { join } from 'node:path'
import * as vscode from 'vscode'

import { buildSetupDescriptor, type SetupDescriptor } from '@ai-dev-pipeline/core'
import { resolvedContent, tasksRoot } from './TaskSession'
import { WebviewBridge } from '@ai-dev-pipeline/core'
import { vscodeTransport } from '../bridge/vscodeTransport'
import { normaliseSetup, validateSetup, type SetupSelection } from '@ai-dev-pipeline/core'

export type { SetupDescriptor, SetupSelection }

/** New starts a task; Existing picks up one already saved under the tasks root. */
type Mode = 'new' | 'existing'

/**
 * The left pane. Collects the task-level facts that feed the workflow —
 * platform, epic, task type and microservices — then hands them to the caller,
 * which creates the task and opens the middle pane. It also offers the saved
 * tasks that still have work in them, so continuing one does not mean
 * remembering its id and going through the command palette.
 */
export class SetupView implements vscode.WebviewViewProvider {
  public static readonly viewId = 'aiDevWorkflow.setup'

  private bridge: WebviewBridge<SetupDescriptor> | undefined
  private values: Record<string, unknown> = {}
  private errors: Record<string, string> = {}

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly onStart: (selection: SetupSelection) => Promise<void>,
    private readonly onResume: (taskId: string) => Promise<void>,
  ) {}

  async resolveWebviewView(view: vscode.WebviewView): Promise<void> {
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(join(this.context.extensionPath, 'out'))],
    }

    const asset = (name: string) =>
      view.webview.asWebviewUri(vscode.Uri.file(join(this.context.extensionPath, 'out', name)))
    view.webview.html = html(view.webview, asset('setup.js'), asset('setup.css'))

    // Same seam as the workflow panel — one place that talks to a webview.
    this.bridge = new WebviewBridge<SetupDescriptor>(vscodeTransport(view.webview))
    this.bridge.onAction(({ actionId, values }) => {
      void this.onAction(actionId, values)
    })
    view.onDidChangeVisibility(() => {
      if (!view.visible) this.bridge?.resetReady()
    })

    await this.render()
  }

  /** Redraw, for when a setting changes underneath the pane. */
  async refresh(): Promise<void> {
    await this.render()
  }

  private async onAction(actionId: string, values: Record<string, unknown>): Promise<void> {
    // Merged, not replaced: the form only reports the fields it is currently
    // showing, and switching modes must not throw away what has been typed.
    this.values = { ...this.values, ...values }

    // Changing the task type can change which fields the form offers, so the
    // host redraws it. The renderer never decides which workflow needs what.
    if (actionId === 'refresh') {
      // A different choice is a fresh attempt; errors from the last one would
      // otherwise sit under fields the developer has since moved away from.
      this.errors = {}
      await this.render()
      return
    }

    if (actionId === 'browse') {
      await this.browse()
      return
    }

    if (actionId === 'open') {
      await this.open()
      return
    }

    if (actionId === 'openSettings') {
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'aiDevWorkflow.contentRoot',
      )
      return
    }

    if (actionId === 'start') await this.start()
  }

  private mode(): Mode {
    return this.values.mode === 'existing' ? 'existing' : 'new'
  }

  /** Reopen a saved task at the step it stopped on. */
  private async open(): Promise<void> {
    const taskId = String(this.values.existingTask ?? '').trim()
    if (!taskId) {
      this.errors.existingTask = 'Select a task to continue'
      await this.render()
      return
    }

    this.errors = {}
    try {
      await this.onResume(taskId)
    } catch (err) {
      this.errors.existingTask = `Could not open ${taskId}: ${String(err)}`
      await this.render()
    }
  }

  /** The native folder picker: paths are long and a typo clones somewhere silently wrong. */
  private async browse(): Promise<void> {
    const current = String(this.values.workDir ?? '').trim()
    const chosen = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Use as work directory',
      defaultUri: current ? vscode.Uri.file(current) : undefined,
    })
    if (!chosen?.[0]) return

    this.values.workDir = chosen[0].fsPath
    delete this.errors.workDir
    await this.render()
  }

  private async start(): Promise<void> {
    const selection = normaliseSetup(this.selection())

    this.errors = validateSetup(selection)
    if (Object.keys(this.errors).length > 0) {
      await this.render()
      return
    }

    // Remembered for next time. The task keeps the value it started with, so
    // changing this later never moves a running task's repositories.
    await vscode.workspace
      .getConfiguration('aiDevWorkflow')
      .update('codeRoot', selection.workDir, vscode.ConfigurationTarget.Global)

    try {
      await this.onStart(selection)
    } catch (err) {
      this.errors.platform = `Could not start task: ${String(err)}`
      await this.render()
    }
  }

  private selection(): SetupSelection {
    return {
      platform: String(this.values.platform ?? ''),
      epic: String(this.values.epic ?? ''),
      workflowId: String(this.values.workflowId ?? ''),
      featureStory: String(this.values.featureStory ?? ''),
      baseBranch: String(this.values.baseBranch ?? ''),
      workDir: String(this.values.workDir ?? ''),
      services: Array.isArray(this.values.services) ? this.values.services.map(String) : [],
    }
  }

  /**
   * The line at the foot of the pane, named as well as numbered.
   *
   * "0.8.1" on its own means nothing in a screenshot; the whole point is that
   * somebody can send one and be told which build they are on. The host composes
   * the whole string, as it does for the banner — the renderer knows the
   * extension's name no more than it knows a workflow's. See spec Section 9.
   */
  private versionLine(): string {
    const version = (this.context.extension.packageJSON as { version?: string }).version
    return `AI Dev Workflow ${version ?? 'unknown version'}`
  }

  /**
   * The pane, from core.
   *
   * Everything about *what* the form looks like now lives in
   * `buildSetupDescriptor`, so the JetBrains tool window draws the same one.
   * What is left here is the half only VS Code can answer: where its settings
   * and its bundled workflows are. See spec Section 19.
   */
  private async render(): Promise<void> {
    if (!this.bridge) return

    this.bridge.render(
      await buildSetupDescriptor({
        resolved: resolvedContent(this.context),
        workflowsDir: join(this.context.extensionPath, 'workflows'),
        tasksRoot: tasksRoot(),
        codeRoot: configuredCodeRoot(),
        version: this.versionLine(),
        values: this.values,
        errors: this.errors,
      }),
    )
  }

}

function configuredCodeRoot(): string | undefined {
  return vscode.workspace.getConfiguration('aiDevWorkflow').get<string>('codeRoot')
}

function html(
  webview: vscode.Webview,
  scriptUri: vscode.Uri,
  styleUri: vscode.Uri,
): string {
  const nonce = Math.random().toString(36).slice(2)
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource};">
<link rel="stylesheet" href="${styleUri.toString()}">
</head><body><div id="root"></div>
<script nonce="${nonce}" src="${scriptUri.toString()}"></script></body></html>`
}
