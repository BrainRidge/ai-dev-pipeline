import * as vscode from 'vscode'
import { join } from 'node:path'

export type Mechanism = 'A' | 'B' | 'C'

export interface Handoff {
  deliver(prompt: string, taskDir: string): Promise<Mechanism>
}

/**
 * The fallback ladder from spec Section 8. Every rung is functional — the value
 * lies in the composed prompt, not in how it reaches the chat box. A degrades
 * to B degrades to C without touching anything outside this class.
 *
 * Which rung succeeds first is settled by the Task 0 spike.
 */
export class ChatHandoff implements Handoff {
  async deliver(prompt: string, taskDir: string): Promise<Mechanism> {
    // A: chat opens with the prompt already filled in.
    try {
      await vscode.commands.executeCommand('workbench.action.chat.open', {
        query: prompt,
        mode: 'agent',
      })
      return 'A'
    } catch {
      // fall through
    }

    // B: prompt on the clipboard, chat opened for one paste.
    try {
      await vscode.env.clipboard.writeText(prompt)
      await vscode.commands.executeCommand('workbench.action.chat.open')
      void vscode.window.showInformationMessage(
        'Prompt copied to the clipboard — paste it into Copilot Chat.',
      )
      return 'B'
    } catch {
      // fall through
    }

    // C: prompt written to a file and opened in an editor tab.
    const file = vscode.Uri.file(join(taskDir, '.engine', 'prompt.md'))
    await vscode.workspace.fs.writeFile(file, Buffer.from(prompt, 'utf8'))
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file))
    void vscode.window.showWarningMessage(
      'Could not open Copilot Chat. The composed prompt is open in an editor tab.',
    )
    return 'C'
  }
}
