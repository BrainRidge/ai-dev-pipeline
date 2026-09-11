import { join } from 'node:path'
import { repoNameOf, type Microservice, type StepDef } from '../engine/schema'
import type { CommandMode, CommandPlanner, CommandSink } from './CommandSink'
import type { Answers, CommandBlock, StepContext, ValidationResult } from './context'
import type { TaskType, TaskView } from './TaskType'

/**
 * Plans the git commands for the microservices chosen in the sidebar and hands
 * them to the developer to run. It deliberately executes nothing.
 *
 * The trade is explicit: the extension can no longer report which clone failed
 * or why, because it never sees the output. What it can still do — and what the
 * audit log records — is exactly which commands were put in front of the
 * developer. Everything that touches a real repository stays their deliberate
 * act.
 *
 * The plan is rebuilt on every render, so cloning one repository by hand and
 * coming back shows that block in its already-cloned form.
 */
export class GitClone implements TaskType, CommandPlanner {
  readonly name = 'gitClone'
  readonly stepType = 'commandExecution' as const
  readonly title = 'Get the code'
  /** Copy and Terminal are affordances; only this completes the step. */
  readonly transitions = ['submit'] as const

  /**
   * @param fallbackWorkDir used only by tasks started before the work
   *        directory was collected in the sidebar.
   */
  constructor(
    private readonly fallbackWorkDir: string,
    private readonly exists: (path: string) => boolean,
    private readonly sink: CommandSink,
  ) {}

  async describe(_step: StepDef, ctx: StepContext, _values: Answers): Promise<TaskView> {
    const blocks = this.plan(ctx)
    const base = baseBranchOf(ctx)
    return {
      text: blocks.length
        ? `Run these in a terminal${base ? ` to put each repository on \`${base}\`` : ''} under \`${this.workDirOf(ctx)}\`, then mark the step done. Every line is a plain git command against a full path, so it runs the same in any shell. Nothing here runs on its own.`
        : 'No microservice in the catalogue matched what was selected, so there is nothing to run.',
      commands: blocks,
      actions: [
        { id: 'back', label: 'Back' },
        { id: 'submit', label: 'I have run these', primary: true },
      ],
    }
  }

  plan(ctx: StepContext): CommandBlock[] {
    const base = baseBranchOf(ctx)

    return this.selected(ctx).map((service) => {
      // Every line is a plain git invocation against a quoted absolute path:
      // no `cd`, no `mkdir`, nothing a shell has to interpret. That is
      // deliberate. The plan used to open with `mkdir -p` and `cd`, which are
      // POSIX idioms — `mkdir -p` means something else in PowerShell, and an
      // unquoted Windows path pasted into Git Bash has its backslashes eaten as
      // escapes. `git -C` needs neither, and `git clone` creates missing parent
      // directories itself, so the same block now runs unchanged in bash, zsh,
      // PowerShell and cmd. See spec Section 6.
      //
      // The folder is the repository's own name, not the shortCode: that is
      // what a developer sees on disk and what git would choose unaided.
      const path = this.pathOf(ctx, service)
      const lines = this.exists(path)
        ? [`git -C "${path}" fetch origin`]
        : [`git clone "${service.gitLocation}" "${path}"`]

      // Without a base branch there is nothing safe to check out, and guessing
      // one would put the developer on a branch they did not choose.
      if (base) lines.push(`git -C "${path}" checkout ${base}`, `git -C "${path}" pull`)

      return {
        id: service.shortCode,
        label: `${service.microserviceName} (${service.shortCode})`,
        lines,
      }
    })
  }

  async deliver(
    blockId: string,
    mode: CommandMode,
    ctx: StepContext,
  ): Promise<{ label: string; text: string }> {
    const blocks = this.plan(ctx)

    const chosen = blockId === 'all' ? blocks : blocks.filter((b) => b.id === blockId)
    if (chosen.length === 0) {
      throw new Error(`no commands planned for "${blockId}"`)
    }

    const text = chosen.map((b) => b.lines.join('\n')).join('\n\n')
    const label =
      blockId === 'all' ? `all ${blocks.length} repositories` : (chosen[0]?.label ?? blockId)

    if (mode === 'copy') await this.sink.copy(text)
    else await this.sink.toTerminal(text)

    return { label, text }
  }

  validate(): ValidationResult {
    return { ok: true, errors: {} }
  }

  async execute(
    _step: StepDef,
    ctx: StepContext,
    _values: Answers,
  ): Promise<Record<string, unknown>> {
    return {
      // Absolute: the generated .code-workspace and the #file: references in
      // the Copilot prompt both need real paths.
      repos: this.selected(ctx).map((s) => ({ name: folderFor(s), path: this.pathOf(ctx, s) })),
      branch: baseBranchOf(ctx),
      commands: this.plan(ctx),
    }
  }

  private workDirOf(ctx: StepContext): string {
    return String(ctx.inputs.workDir ?? '').trim() || this.fallbackWorkDir
  }

  private pathOf(ctx: StepContext, service: Microservice): string {
    return join(this.workDirOf(ctx), folderFor(service))
  }

  /** A selected shortCode with no catalogue entry is ignored, not fatal. */
  private selected(ctx: StepContext): Microservice[] {
    const codes = Array.isArray(ctx.inputs.services) ? ctx.inputs.services.map(String) : []
    return codes
      .map((code) => ctx.microservices.find((s) => s.shortCode === code))
      .filter((s) => s !== undefined)
  }
}

/** The catalogue rejects an unusable gitLocation at load, so this is a backstop. */
function folderFor(service: Microservice): string {
  return repoNameOf(service.gitLocation) ?? service.shortCode
}

function baseBranchOf(ctx: StepContext): string {
  return String(ctx.inputs.baseBranch ?? '').trim()
}
