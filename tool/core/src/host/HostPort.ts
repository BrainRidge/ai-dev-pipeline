import type { CommandSink } from '../tasks/CommandSink'
import type { EnvironmentReader } from '../tasks/Environment'
import type { Handoff } from '../handoff/Handoff'

/**
 * Where a host installs a developer's own Agent Skills, and from which version
 * of that IDE it can. A host whose IDE has no skills support supplies
 * `undefined` for the whole thing, and the Tool Check step reports the step as
 * unsupported rather than silently doing nothing. See spec Section 18.
 */
export interface SkillsSupport {
  /** Relative to the developer's home directory, e.g. `.copilot/skills`. */
  readonly dir: string
  /** The first IDE version that can use an installed skill. */
  readonly minimumVersion: string
}

/**
 * Everything core needs from an IDE, and nothing more.
 *
 * This is the whole of the porting surface. `buildTaskTypes` used to reach for
 * `vscode` directly for these capabilities; naming them instead is what lets the
 * task vocabulary — and so the workflow semantics — live in one place and run in
 * both IDEs. A second host is implemented by satisfying this interface, not by
 * copying the engine. See spec Section 19.
 *
 * Adding a member here is the moment to stop and think: it is a new thing every
 * host must implement, and `npm run check:parity` fails until both do.
 */
export interface HostPort {
  /** Clipboard and terminal. The two ways a command block leaves the panel. */
  readonly sink: CommandSink

  /** What the editor can be asked about itself. See spec Section 17. */
  readonly environment: EnvironmentReader

  /** Delivers a composed prompt to the assistant. See spec Section 8. */
  readonly handoff: Handoff

  /**
   * Opens an artifact for review without covering the workflow panel and
   * without stealing focus from it. Both halves matter — see spec Section 9.
   */
  openInEditor(path: string): Promise<void>

  /** The IDE's own version, compared against `skills.minimumVersion`. */
  readonly editorVersion: string

  /** How this host installs Agent Skills, or undefined if it cannot. */
  readonly skills: SkillsSupport | undefined
}
