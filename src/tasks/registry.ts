import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { access, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import * as vscode from 'vscode'
import { AuditLog } from '../audit/AuditLog'
import { nodeProbe, templateResolver } from '../content/ContentRoot'
import { ChatHandoff } from '../handoff/ChatHandoff'
import { PromptComposer } from '../prompt/PromptComposer'
import { DEFAULT_TOOLS, loadTools, type ResolvedTools } from '../engine/ToolCatalog'
import {
  planSkills,
  skillNameOf,
  supportsSkills,
  USER_SKILLS_DIR,
  type SkillFile,
} from '../skills/Skills'
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
import type { SkillInstaller, SkillReport } from './ToolCheck'

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

/**
 * Opens an artifact for review beside the workflow panel rather than on top of
 * it. `ViewColumn.Beside` because the panel lives in the editor area and a
 * document opened into the same column covers it — which is not merely untidy:
 * it is how the developer loses sight of the step they are being asked to
 * approve. `preserveFocus` because the panel is what they are about to press a
 * button on. See spec Section 9.
 */
async function openInEditor(p: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(p))
  await vscode.window.showTextDocument(doc, {
    preview: false,
    viewColumn: vscode.ViewColumn.Beside,
    preserveFocus: true,
  })
}

/** Where a developer's own Agent Skills live. See spec Section 18. */
function userSkillsDir(): string {
  return join(homedir(), ...USER_SKILLS_DIR.split('/'))
}

/**
 * Every skill file available, the team's overriding the bundled one by filename.
 *
 * The same per-file fallback prompt templates get, applied to a folder rather
 * than to a named file — a team overriding one skill keeps receiving every other
 * skill a release adds. See spec Sections 16 and 18.
 */
async function readSkillFiles(dirs: {
  external?: string
  bundled: string
}): Promise<SkillFile[]> {
  const found = new Map<string, SkillFile>()

  for (const [source, dir] of [
    ['bundled', dirs.bundled],
    ['external', dirs.external],
  ] as const) {
    if (!dir) continue
    const names = await readdir(dir).catch(() => [] as string[])
    for (const filename of names.filter((n) => n.toLowerCase().endsWith('.md'))) {
      const path = join(dir, filename)
      found.set(skillNameOf(filename), {
        name: skillNameOf(filename),
        path,
        source,
        raw: await readFile(path, 'utf8'),
      })
    }
  }

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Installs skills into the developer's own skills folder.
 *
 * This is the one thing the extension writes outside a task folder, so the rule
 * from spec Section 16 applies unchanged: a file is ours to update only if it is
 * absent or still holds exactly what we last wrote. What we last wrote is
 * remembered per skill, so a skill somebody has tuned survives every later
 * install. See spec Section 18.
 */
function skillInstaller(opts: {
  promptsDir: string | undefined
  bundledPromptsDir: string
  vscodeVersion: string
  remembered: Record<string, string>
  remember: (written: Record<string, string>) => Promise<void>
}): SkillInstaller {
  return {
    async install(): Promise<SkillReport> {
      const dir = userSkillsDir()
      if (!supportsSkills(opts.vscodeVersion)) {
        return { dir, findings: [], supported: false }
      }

      const files = await readSkillFiles({
        external: opts.promptsDir ? join(opts.promptsDir, 'skills') : undefined,
        bundled: join(opts.bundledPromptsDir, 'skills'),
      })

      const onDisk: Record<string, string | undefined> = {}
      for (const file of files) {
        onDisk[file.name] = await readFile(join(dir, file.name, 'SKILL.md'), 'utf8').catch(
          () => undefined,
        )
      }

      const plan = planSkills(files, onDisk, opts.remembered)

      for (const [name, content] of Object.entries(plan.writes)) {
        await mkdir(join(dir, name), { recursive: true })
        await writeFile(join(dir, name, 'SKILL.md'), content, 'utf8')
      }

      if (Object.keys(plan.writes).length > 0) {
        await opts.remember({ ...opts.remembered, ...plan.writes })
      }

      return { dir, findings: plan.findings, supported: true }
    },
  }
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
  /** Decides whether Agent Skills can be installed at all. See spec Section 18. */
  vscodeVersion: string
  /** What was last written into the developer's skills folder, per skill name. */
  installedSkills: Record<string, string>
  rememberSkills: (written: Record<string, string>) => Promise<void>
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
    new ToolCheck(
      loadToolList,
      nodeToolProbe,
      sink,
      editorEnvironment,
      skillInstaller({
        promptsDir: opts.promptsDir,
        bundledPromptsDir: opts.bundledPromptsDir,
        vscodeVersion: opts.vscodeVersion,
        remembered: opts.installedSkills,
        remember: opts.rememberSkills,
      }),
    ),
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
