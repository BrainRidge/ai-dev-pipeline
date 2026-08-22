import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import * as vscode from 'vscode'
import { AuditLog } from './audit/AuditLog'
import { report, summarise } from './audit/summary'
import { TaskSession, contentRoot, tasksRoot } from './session/TaskSession'
import { externalWorkflowsPresent, nodeProbe } from './content/ContentRoot'
import { SetupView } from './session/SetupView'
import { taskIdFromWorkspaceSettings } from './session/resume'
import { checkForUpdate } from './update/UpdateCheck'
import { writeDerivedSettings } from './session/derivedSettings'

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const resume = async (taskId: string): Promise<void> => {
    const session = await TaskSession.resume(context, taskId)
    if (!session) {
      void vscode.window.showErrorMessage(`Task ${taskId} has no saved state.`)
      return
    }
    session.show()
  }

  // Pane 1: the activity-bar sidebar. Collects the task-level inputs that feed
  // the workflow, then opens the workflow panel in the editor area (pane 2).
  // It also lists unfinished tasks, so continuing one needs no command palette.
  const setup = new SetupView(
    context,
    async (selection) => {
      const session = await TaskSession.startWith(context, selection)
      session?.show()
    },
    resume,
  )
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SetupView.viewId, setup),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('aiDevWorkflow.startTask', async () => {
      try {
        const session = await TaskSession.start(context)
        session?.show()
      } catch (err) {
        void vscode.window.showErrorMessage(`Could not start task: ${String(err)}`)
      }
    }),

    vscode.commands.registerCommand('aiDevWorkflow.handoffReport', async () => {
      const doc = await vscode.workspace.openTextDocument({
        content: await handoffReport(),
        language: 'markdown',
      })
      await vscode.window.showTextDocument(doc, { preview: false })
    }),

    vscode.commands.registerCommand('aiDevWorkflow.resumeTask', async () => {
      const ids = (await readdir(tasksRoot()).catch(() => [] as string[])).filter(
        (n) => !n.startsWith('.'),
      )
      if (ids.length === 0) {
        void vscode.window.showInformationMessage('No tasks found.')
        return
      }
      const chosen = await vscode.window.showQuickPick(ids.reverse(), {
        placeHolder: 'Resume which task?',
      })
      if (!chosen) return
      await resume(chosen)
    }),
  )

  void notifyIfOutOfDate(context)
  void warnAboutExternalWorkflows()

  // Setting the content root fills the three specific paths in. Run once at
  // activation too, so a settings.json edited by hand is honoured without a
  // second change. See spec Section 16.
  void writeDerivedSettings(context)
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('aiDevWorkflow.contentRoot')) {
        await writeDerivedSettings(context)
      }
      // Any content setting can turn the sidebar's error into a working form,
      // so it must redraw rather than leave a stale message on screen.
      if (e.affectsConfiguration('aiDevWorkflow')) await setup.refresh()
    }),
  )

  // Resume automatically when a generated workspace is opened. This is what
  // makes a workflow survive the extension-host restart that opening the
  // multi-root workspace causes. See spec Section 7.
  const taskId = taskIdFromWorkspaceSettings({
    'aiDevWorkflow.taskId':
      vscode.workspace.getConfiguration('aiDevWorkflow').get<string>('taskId') ?? '',
  })
  if (taskId) {
    try {
      const session = await TaskSession.resume(context, taskId)
      session?.show()
    } catch (err) {
      void vscode.window.showErrorMessage(`Could not resume task ${taskId}: ${String(err)}`)
    }
  }
}

/**
 * What the session logs on this machine say about the handoff ladder.
 *
 * The data has been on disk since the first task; nobody was reading it, which
 * is why V1 stayed open. A folder that cannot be read as a task is skipped, for
 * the same reason the sidebar skips it: these directories accumulate abandoned
 * experiments, and one unparseable file must not cost the whole report. See spec
 * Section 12.
 */
async function handoffReport(): Promise<string> {
  const root = tasksRoot()
  const ids = (await readdir(root).catch(() => [] as string[])).filter((n) => !n.startsWith('.'))

  const perTask = await Promise.all(
    ids.map((id) => new AuditLog(join(root, id)).entries().catch(() => [])),
  )

  return report(summarise(perTask.filter((entries) => entries.length > 0)))
}

/**
 * Workflows stay bundled — they are what the tool standardises. A team that has
 * put a workflows folder in their content root has misread the contract, and
 * silence would let them believe it took effect. See spec Section 16.
 */
async function warnAboutExternalWorkflows(): Promise<void> {
  const root = contentRoot()
  if (!root) return
  if (!(await externalWorkflowsPresent(root, nodeProbe))) return
  void vscode.window.showWarningMessage(
    'Your content folder contains a workflows/ directory. Workflow definitions ' +
      'are bundled with the extension and cannot be overridden, so it is ignored.',
  )
}

async function notifyIfOutOfDate(context: vscode.ExtensionContext): Promise<void> {
  const latest = await checkForUpdate({
    manifestUrl:
      vscode.workspace.getConfiguration('aiDevWorkflow').get<string>('updateManifestUrl') ?? '',
    currentVersion: (context.extension.packageJSON as { version: string }).version,
    fetchJson: async (url) => (await (await fetch(url)).json()) as { version: string },
  })
  if (latest) {
    void vscode.window.showInformationMessage(
      `AI Dev Workflow ${latest} is available. Install the new .vsix to update.`,
    )
  }
}

export function deactivate(): void {}
