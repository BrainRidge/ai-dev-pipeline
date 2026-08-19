import { readdir } from 'node:fs/promises'
import * as vscode from 'vscode'
import { TaskSession, tasksRoot } from './session/TaskSession'
import { SetupView } from './session/SetupView'
import { taskIdFromWorkspaceSettings } from './session/resume'
import { checkForUpdate } from './update/UpdateCheck'

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
