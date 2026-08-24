import { createHash } from 'node:crypto'
import { dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { access, copyFile, mkdir, readFile } from 'node:fs/promises'
import * as vscode from 'vscode'
import { AuditLog } from '../audit/AuditLog'
import { nodeProbe, templateResolver } from '../content/ContentRoot'
import { ChatHandoff } from '../handoff/ChatHandoff'
import { PromptComposer } from '../prompt/PromptComposer'
import { DEFAULT_TOOLS, loadTools, type ResolvedTools } from '../engine/ToolCatalog'
import { defaultProviders } from '../providers/registry'
import { CollectRequirement } from './CollectRequirement'
import { GitClone } from './GitClone'
import { InvokeCopilot } from './InvokeCopilot'
import { InvokeCopilotCoding } from './InvokeCopilotCoding'
import { InvokeCopilotCodeReview } from './InvokeCopilotCodeReview'
import { ManualReview } from './ManualReview'
import { ToolCheck } from './ToolCheck'
import { TaskTypeRegistry } from './TaskType'
import type { CommandSink } from './CommandSink'
import { nodeToolProbe } from './ToolProbe'
import type { EnvironmentReader } from './Environment'

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

/** Keeps what was approved, so the audit trail holds more than a hash. */
async function keepCopy(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true })
  await copyFile(from, to)
}

const TERMINAL = 'AI Dev Workflow'

/**
 * What the editor can be asked about itself. Two one-liners, so that the
 * judgement of what the answers mean stays in `Environment.ts` where it can be
 * tested without an extension host. See spec Section 17.
 */
const editorEnvironment: EnvironmentReader = {
  setting(id) {
    // Split on the last dot: getConfiguration wants the section and the key
    // separately, and `chat.agent.enabled` is section `chat`, key `agent.enabled`.
    const cut = id.indexOf('.')
    return vscode.workspace.getConfiguration(id.slice(0, cut)).get<boolean>(id.slice(cut + 1))
  },
  async commands() {
    return vscode.commands.getCommands(true)
  },
}

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
  /** The team's prompts folder, or undefined when they supplied none. */
  promptsDir: string | undefined
  /** The prompts shipped in the extension, used wherever the team supplied none. */
  bundledPromptsDir: string
  /** The team's tool list, or undefined when they supplied none. */
  toolsConfig: string | undefined
  taskDir: string
  codeRoot: string
}): TaskTypeRegistry {
  // Stateless, so one instance serves every handoff. See spec Section 16.
  const composer = new PromptComposer(
    templateResolver(
      { promptsDir: opts.promptsDir, bundledPromptsDir: opts.bundledPromptsDir },
      nodeProbe,
    ),
  )

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

  /**
   * The team's list if the file is there, the bundled default otherwise. A file
   * that is present but unreadable as a tool list throws, and ToolCheck shows
   * that on its own step. See spec Section 17.
   */
  const loadToolList = async (): Promise<ResolvedTools> => {
    if (opts.toolsConfig) {
      const tools = await loadTools(opts.toolsConfig)
      if (tools) return { tools, source: 'external', path: opts.toolsConfig }
    }
    return { tools: DEFAULT_TOOLS, source: 'bundled' }
  }

  return new TaskTypeRegistry([
    new ToolCheck(loadToolList, nodeToolProbe, sink, editorEnvironment),
    // Providers are passed in rather than defaulted, so the one place that wires
    // the vocabulary is also the one place P3 adds an MCP provider.
    new CollectRequirement(defaultProviders()),
    new GitClone(opts.codeRoot, existsSync, sink),
    new InvokeCopilot(
      composer,
      new ChatHandoff(),
      new AuditLog(opts.taskDir),
      fileExists,
      sink,
    ),
    new InvokeCopilotCoding(
      composer,
      new ChatHandoff(),
      new AuditLog(opts.taskDir),
      sink,
    ),
    new InvokeCopilotCodeReview(
      composer,
      new ChatHandoff(),
      new AuditLog(opts.taskDir),
      sink,
    ),
    new ManualReview(openInEditor, hashFile, keepCopy),
  ])
}
