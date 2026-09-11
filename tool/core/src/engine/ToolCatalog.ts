import { readFile } from 'node:fs/promises'
import { toolsFileSchema, type ToolDef } from './schema'

export type ToolsSource = 'external' | 'bundled'

export interface ResolvedTools {
  tools: ToolDef[]
  source: ToolsSource
  /** Absent for the bundled default, which is a constant rather than a file. */
  path?: string
}

/**
 * The tool list a team gets when it has supplied none.
 *
 * It is a constant rather than a bundled file on purpose. Spec Section 16
 * removed the bundled `config/` directory because nothing fell back to it, and
 * reintroducing one for a single file would make "which config/ is this"
 * ambiguous. The copyable version lives in
 * `examples/content-template/config/tools.json`, which is where a team looks
 * for the layout anyway.
 *
 * Parsed through its own schema so a default that disobeys it fails at import
 * rather than on a developer's machine.
 */
export const DEFAULT_TOOLS: ToolDef[] = toolsFileSchema.parse([
  {
    id: 'git',
    label: 'Git',
    command: 'git',
    args: ['--version'],
    required: true,
    minVersion: '2.30',
    why: 'The Get the code step gives you git commands to run yourself.',
    install: {
      darwin: 'brew install git',
      win32: 'winget install Git.Git',
      linux: 'sudo apt install git',
    },
  },
  {
    id: 'java',
    label: 'Java (JDK)',
    command: 'java',
    args: ['-version'],
    required: true,
    minVersion: '17',
    why: 'Copilot compiles and tests the code it changes in the implementation and review steps.',
    install: {
      darwin: 'brew install openjdk@21',
      win32: 'winget install EclipseAdoptium.Temurin.21.JDK',
      linux: 'sudo apt install openjdk-21-jdk',
    },
  },
  {
    id: 'maven',
    label: 'Maven',
    command: 'mvn',
    args: ['-v'],
    required: false,
    why: 'Needed only if the repositories in scope build with Maven.',
    install: {
      darwin: 'brew install maven',
      win32: 'winget install Apache.Maven',
      linux: 'sudo apt install maven',
    },
  },
  {
    id: 'gradle',
    label: 'Gradle',
    command: 'gradle',
    args: ['--version'],
    required: false,
    why: 'Needed only if the repositories in scope build with Gradle, and not when they use the wrapper.',
    install: {
      darwin: 'brew install gradle',
      win32: 'winget install Gradle.Gradle',
      linux: 'sudo apt install gradle',
    },
  },
])

/**
 * Two tools must not share an id: it is the key the findings are reported and
 * stored under, and a clash would silently drop one from the report.
 */
export function validateTools(tools: ToolDef[]): void {
  const seen = new Map<string, string>()
  for (const tool of tools) {
    const clash = seen.get(tool.id)
    if (clash) {
      throw new Error(`tools: "${tool.label}" and "${clash}" share the id "${tool.id}"`)
    }
    seen.set(tool.id, tool.label)
  }
}

/**
 * The team's tool list, or `undefined` when the file is not there.
 *
 * Absence is an ordinary outcome — it means fall back to the default, the same
 * per-file fallback prompt templates get. A file that is present but unreadable
 * as a tool list is an error, and its wording is the most useful thing this
 * loader produces, so it is passed through with only the path added.
 */
export async function loadTools(path: string): Promise<ToolDef[] | undefined> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw err
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`Tool config at ${path} is not valid JSON: ${(err as Error).message}`)
  }

  let tools: ToolDef[]
  try {
    tools = toolsFileSchema.parse(parsed)
  } catch (err) {
    throw new Error(
      `Tool config at ${path} is not valid: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  validateTools(tools)
  return tools
}

/**
 * The first dotted number in a tool's own version output.
 *
 * Deliberately crude: every tool prints its version differently, and the
 * alternative is a parser per tool. `git version 2.50.1` and
 * `openjdk version "21.0.8" 2025-07-15` both yield what they should. A tool
 * that prints something else — a copyright year first, say — yields the wrong
 * number, which is why an unparseable or surprising version never fails the
 * check on its own. Only absence does that.
 */
export function versionIn(output: string): string | undefined {
  return /\d+(?:\.\d+)*/.exec(output)?.[0]
}

/** Numeric, segment by segment. A missing segment counts as zero: 17 ≥ 17.0. */
export function meetsMinimum(found: string, min: string): boolean {
  const a = found.split('.').map(Number)
  const b = min.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (Number.isNaN(av)) return true
    if (av !== bv) return av > bv
  }
  return true
}
