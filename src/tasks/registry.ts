import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { access, readFile } from 'node:fs/promises'
import * as vscode from 'vscode'
import { AuditLog } from '../audit/AuditLog'
import { ChatHandoff } from '../handoff/ChatHandoff'
import { PromptComposer } from '../prompt/PromptComposer'
import { CollectRequirement } from './CollectRequirement'
import { GitClone } from './GitClone'
import { InvokeCopilot } from './InvokeCopilot'
import { InvokeCopilotCoding } from './InvokeCopilotCoding'
import { InvokeCopilotCodeReview } from './InvokeCopilotCodeReview'
import { ManualReview } from './ManualReview'
import { TaskTypeRegistry } from './TaskType'
import type { CommandSink } from './CommandSink'

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function hashFile(p: string): Promise<string> {
  return createHash('sha256').update(await readFile(p, 'utf8')).digest('hex')
}

const TERMINAL = 'AI Dev Workflow'

async function openInEditor(p: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p))
  await vscode.window.showTextDocument(doc, { preview: false })
}

/**
 * The vocabulary a workflow may compose. Adding a step to a workflow is
 * configuration; adding a new kind of primitive is a class registered here.
 * See spec Section 5.
 */
export function buildTaskTypes(opts: {
  promptDir: string
  taskDir: string
  codeRoot: string
}): TaskTypeRegistry {
  const sink: CommandSink = {
    async copy(text) {
      await vscode.env.clipboard.writeText(text)
    },
    // sendText with addNewLine false pastes at the prompt and stops. The
    // developer presses Enter; nothing runs because a panel button was clicked.
    async toTerminal(text) {
      const terminal =
        vscode.window.terminals.find((t) => t.name === TERMINAL) ??
        vscode.window.createTerminal({ name: TERMINAL })
      terminal.show()
      terminal.sendText(text, false)
    },
  }

  return new TaskTypeRegistry([
    new CollectRequirement(),
    new GitClone(opts.codeRoot, existsSync, sink),
    new InvokeCopilot(
      new PromptComposer(opts.promptDir),
      new ChatHandoff(),
      new AuditLog(opts.taskDir),
      fileExists,
      sink,
    ),
    new InvokeCopilotCoding(
      new PromptComposer(opts.promptDir),
      new ChatHandoff(),
      new AuditLog(opts.taskDir),
      sink,
    ),
    new InvokeCopilotCodeReview(
      new PromptComposer(opts.promptDir),
      new ChatHandoff(),
      new AuditLog(opts.taskDir),
      sink,
    ),
    new ManualReview(openInEditor, hashFile),
  ])
}
