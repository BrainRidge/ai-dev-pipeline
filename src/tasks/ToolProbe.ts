import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export interface ProbeResult {
  /** The executable was found and ran. Its exit code is not the question. */
  found: boolean
  /** stdout and stderr together — `java -version` writes to stderr. */
  output: string
}

/**
 * Asks the machine whether a tool is there. Keeping this an interface is what
 * lets the System Check step be tested without spawning anything, and it is the
 * same shape of seam as CommandSink and Handoff.
 *
 * It answers "is it installed", never "run this for me". Nothing a probe runs
 * touches a repository, and the arguments come from a tool list the team owns
 * and reviews, not from anything a developer types.
 */
export interface ToolProbe {
  run(command: string, args: string[]): Promise<ProbeResult>
}

/** A probe waits this long for a tool to answer before giving up on it. */
export const PROBE_TIMEOUT_MS = 5000

/**
 * On Windows a great many development tools are batch shims rather than
 * executables — Maven ships `mvn.cmd`, Gradle ships `gradle.bat` — and Node
 * will not find those without a shell. Rather than turn a shell on for
 * arguments that come from a config file, we try the extensions ourselves.
 * The list is a single empty suffix elsewhere, so POSIX spawns exactly once.
 */
export function candidatesFor(command: string, platform: string = process.platform): string[] {
  const suffixes = platform === 'win32' ? ['', '.cmd', '.bat', '.exe'] : ['']
  return suffixes.map((suffix) => `${command}${suffix}`)
}

/**
 * The real probe. Lives here rather than in `registry.ts` so that it can be
 * tested against a real machine without an extension host — the same reason
 * `nodeProbe` sits beside `DirectoryProbe` in `ContentRoot.ts`.
 *
 * `shell` is left off, so nothing in a tool list can be interpreted as a shell
 * command. A non-zero exit still counts as found when the process ran: some
 * tools print their version and exit 1, and the question here is whether the
 * tool is on the machine, not whether it approves of its arguments.
 *
 * See spec Section 17.
 */
export const nodeToolProbe: ToolProbe = {
  async run(command, args): Promise<ProbeResult> {
    for (const candidate of candidatesFor(command)) {
      try {
        const { stdout, stderr } = await run(candidate, args, {
          timeout: PROBE_TIMEOUT_MS,
          windowsHide: true,
        })
        return { found: true, output: `${stdout}\n${stderr}`.trim() }
      } catch (err) {
        const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string }
        if (e.code === 'ENOENT') continue
        // Ran and complained, or timed out. Found, but the version may be
        // unreadable — which Section 17 says must never fail the check alone.
        return { found: true, output: `${e.stdout ?? ''}\n${e.stderr ?? ''}`.trim() }
      }
    }
    return { found: false, output: '' }
  },
}
