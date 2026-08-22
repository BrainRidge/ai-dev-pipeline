import type { StepDef, ToolDef } from '../engine/schema'
import type { ResolvedTools } from '../engine/ToolCatalog'
import { meetsMinimum, versionIn } from '../engine/ToolCatalog'
import type { CommandSink } from './CommandSink'
import { readEnvironment, type EnvironmentReader } from './Environment'
import type { Answers, CommandBlock, StepContext, ValidationResult } from './context'
import type { TaskType, TaskView } from './TaskType'
import type { ToolProbe } from './ToolProbe'

/**
 * `off` and `unknown` belong to the editor checks rather than to tools: a
 * setting can be turned off, and a setting that does not exist in this version
 * cannot be judged at all. `unknown` never blocks — refusing to let somebody
 * work because we could not tell would be worse than not checking.
 */
export type FindingStatus = 'ok' | 'missing' | 'outdated' | 'off' | 'unknown'

export interface Finding {
  id: string
  label: string
  required: boolean
  status: FindingStatus
  /** What the tool reported, when it could be read out of its output. */
  version?: string
  minVersion?: string
  why: string
  /** The hint for this machine's platform, or what to do about a setting. */
  install?: string
  /**
   * Overrides the right-hand column. Set by the editor checks, which are not
   * tools and do not read as ones.
   */
  state?: string
}

/** The block id the report is shown under. The renderer never knows this name. */
export const REPORT_BLOCK_ID = 'systemCheck'

/** What TaskSession needs from the step that reports on the machine. */
export interface SystemReporter {
  /** Throw the probe results away so the next render asks the machine again. */
  invalidate(): void
  copyReport(step: StepDef, ctx: StepContext): Promise<{ label: string }>
}

export type ToolsLoader = () => Promise<ResolvedTools>

/**
 * Checks that the tools a workflow depends on are installed, before the
 * developer has spent any effort on a task that cannot finish.
 *
 * It costs no model call: every answer comes from running the tool's own
 * `--version` and reading what comes back. That is the whole point of it being
 * a primitive of its own rather than something asked of Copilot — the machine
 * is a fact, not a judgement, and paying for a judgement about a fact would be
 * both slower and less trustworthy.
 *
 * The tool list comes from the team's content folder and falls back to a
 * bundled default, per spec Section 17. Which list was used is captioned above
 * the report, for the same reason a prompt template's path is: a silent
 * fallback is only acceptable if it is visible afterwards.
 *
 * Results are cached for the life of the session. `describe` runs for every
 * step on every render, and spawning four processes each time would make the
 * panel sluggish for an answer that changes when somebody installs something.
 * Re-check is how the developer says that has happened.
 */
export class SystemCheck implements TaskType, SystemReporter {
  readonly name = 'systemCheck'
  readonly stepType = 'systemCheck' as const
  readonly title = 'System check'
  /** Re-check and Copy report act on this step without advancing it. */
  readonly transitions = ['submit'] as const

  private cached: { resolved: ResolvedTools; findings: Finding[] } | undefined
  private failure: string | undefined

  constructor(
    private readonly loadTools: ToolsLoader,
    private readonly probe: ToolProbe,
    private readonly sink: CommandSink,
    /** What the editor says about agent mode and the chat command. */
    private readonly environment: EnvironmentReader,
    /** Injected so the report reads the same in a test on any machine. */
    private readonly platform: string = process.platform,
  ) {}

  invalidate(): void {
    this.cached = undefined
    this.failure = undefined
  }

  async describe(_step: StepDef, _ctx: StepContext, _values: Answers): Promise<TaskView> {
    const actions = [
      { id: 'recheck', label: 'Re-check' },
      // Copying the report is how a developer asks somebody else to fix their
      // machine, which is the likeliest thing to happen on a locked-down laptop.
      { id: 'copy', label: 'Copy report' },
      { id: 'submit', label: 'Continue', primary: true },
    ]

    const state = await this.check()
    if (!state) {
      // A broken tool list is reported on the step that owns it rather than
      // thrown, for the reason spec Section 8 gives: the descriptor describes
      // every step, so throwing here would take down the whole panel.
      return { text: `The tool list could not be read: ${this.failure}`, actions }
    }

    const blocked = blockers(state.findings)
    return {
      text: blocked.length
        ? `${count(blocked.length, 'problem')} to fix before this task can continue. ` +
          'Fix what the report names, then Re-check.'
        : 'Everything this workflow needs is installed. Nothing was run against your repositories.',
      commands: [this.reportBlock(state)],
      actions,
    }
  }

  /**
   * A required tool that is absent or too old blocks the step. This is the one
   * gate in the tool that rests on a detected fact rather than the developer's
   * word, which is why it is allowed to be a gate at all.
   */
  validate(_step: StepDef, _values: Answers): ValidationResult {
    if (this.failure) {
      return { ok: false, errors: { tools: `The tool list could not be read: ${this.failure}` } }
    }
    if (!this.cached) {
      return { ok: false, errors: { tools: 'The check has not run yet. Press Re-check.' } }
    }

    const blocked = blockers(this.cached.findings)
    if (blocked.length === 0) return { ok: true, errors: {} }

    // Named individually with what is wrong with each: "is turned off" and "is
    // missing" call for different actions, and a message that blurs them makes
    // the developer go back and read the report to find out which they have.
    return {
      ok: false,
      errors: {
        tools:
          `${blocked.map((f) => `${f.label} ${wrongWith(f.status)}`).join('; ')}. ` +
          'Fix what the report names, then press Re-check.',
      },
    }
  }

  async execute(
    _step: StepDef,
    _ctx: StepContext,
    _values: Answers,
  ): Promise<Record<string, unknown>> {
    const state = this.cached
    return {
      toolsSource: state?.resolved.source ?? null,
      toolsPath: state?.resolved.path ?? null,
      findings: state?.findings ?? [],
      checkedAt: new Date().toISOString(),
    }
  }

  async copyReport(_step: StepDef, _ctx: StepContext): Promise<{ label: string }> {
    const state = await this.check()
    if (!state) throw new Error(this.failure ?? 'the check has not run')
    await this.sink.copy(this.reportBlock(state).lines.join('\n'))
    return { label: 'the system check report' }
  }

  /** Probes every tool once and remembers the answer. */
  private async check(): Promise<{ resolved: ResolvedTools; findings: Finding[] } | undefined> {
    if (this.cached) return this.cached
    if (this.failure) return undefined

    let resolved: ResolvedTools
    try {
      resolved = await this.loadTools()
    } catch (err) {
      this.failure = err instanceof Error ? err.message : String(err)
      return undefined
    }

    // The editor first: it is the most consequential thing on the list, and
    // unlike a missing build tool it cannot be fixed by installing something.
    const editor = (await readEnvironment(this.environment)).map(
      (f): Finding => ({
        id: f.id,
        label: f.label,
        required: f.required,
        status: f.status,
        state: f.state,
        why: f.detail,
        install: f.fix,
      }),
    )

    const tools = await Promise.all(resolved.tools.map((tool) => this.examine(tool)))
    this.cached = { resolved, findings: [...editor, ...tools] }
    return this.cached
  }

  private async examine(tool: ToolDef): Promise<Finding> {
    const base = {
      id: tool.id,
      label: tool.label,
      required: tool.required,
      minVersion: tool.minVersion,
      why: tool.why,
      install: tool.install[this.platform],
    }

    const result = await this.probe.run(tool.command, tool.args)
    if (!result.found) return { ...base, status: 'missing' }

    const version = versionIn(result.output)
    // An unreadable version is reported as found. The alternative is failing a
    // developer whose tool is installed because we could not parse its banner.
    const outdated =
      tool.minVersion !== undefined && version !== undefined && !meetsMinimum(version, tool.minVersion)

    return { ...base, version, status: outdated ? 'outdated' : 'ok' }
  }

  private reportBlock(state: { resolved: ResolvedTools; findings: Finding[] }): CommandBlock {
    return {
      id: REPORT_BLOCK_ID,
      label: 'System check report',
      note:
        state.resolved.source === 'external'
          ? `Tool list: ${state.resolved.path} (external)`
          : 'Tool list: bundled default',
      lines: reportLines(state.findings),
      // No Copy or Terminal on the block: this is a report, not commands to
      // run. The step offers Copy beside Re-check instead.
      actions: [],
    }
  }
}

const MARK: Record<FindingStatus, string> = {
  ok: '✓',
  missing: '✗',
  outdated: '⚠',
  off: '✗',
  unknown: '?',
}

/**
 * What stops the step: anything required that is absent, too old, or switched
 * off. `unknown` is excluded on purpose — it means the check could not be made,
 * and a check that cannot be made must not become a verdict.
 */
export function blockers(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.required && f.status !== 'ok' && f.status !== 'unknown')
}

/** What is wrong, in words that suit a setting as well as a program. */
function wrongWith(status: FindingStatus): string {
  switch (status) {
    case 'off':
      return 'is turned off'
    case 'outdated':
      return 'is too old'
    default:
      return 'is missing'
  }
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

/**
 * The report, as the developer reads it: every tool on one line, then a
 * paragraph for each problem saying why the tool is needed and how to install
 * it on this machine. Pre-formatted here so the renderer stays a view.
 */
export function reportLines(findings: Finding[]): string[] {
  if (findings.length === 0) return ['The tool list is empty, so nothing was checked.']

  const width = Math.max(...findings.map((f) => f.label.length))
  const lines = findings.map((f) => {
    const mark = f.status === 'missing' && !f.required ? '–' : MARK[f.status]
    return `${f.label.padEnd(width)}  ${mark}  ${describeFinding(f)}`
  })

  for (const f of findings.filter((f) => f.status !== 'ok')) {
    lines.push('', `${f.label} — ${f.required ? 'required' : 'optional'}`)
    if (f.why) lines.push(`  ${'Why'.padEnd(7)}  ${f.why}`)
    // Editor checks are fixed, not installed.
    if (f.install) lines.push(`  ${(f.state ? 'Fix' : 'Install').padEnd(7)}  ${f.install}`)
  }

  return lines
}

function describeFinding(f: Finding): string {
  // A check that worded itself, worded itself for a reason.
  if (f.state) return f.state

  switch (f.status) {
    case 'ok':
      return f.version ?? 'enabled'
    case 'outdated':
      return `${f.version ?? 'unknown'} — needs ${f.minVersion} or newer`
    case 'off':
      return 'turned off'
    case 'unknown':
      return 'could not be checked'
    default:
      return f.required ? 'not found' : 'not found (optional)'
  }
}
