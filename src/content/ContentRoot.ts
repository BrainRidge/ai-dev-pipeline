import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { isAbsolutePath } from '../session/SetupSelection'

export type TemplateSource = 'external' | 'bundled'

export interface ResolvedTemplate {
  path: string
  source: TemplateSource
}

/**
 * The four settings that decide where content comes from. `contentRoot` is a
 * convenience: setting it fills the other three in. Each of the three can also
 * be set on its own, and whatever is in it wins. See spec Section 16.
 */
export interface ContentSettings {
  contentRoot: string
  microserviceConfig: string
  platformConfig: string
  customPrompts: string
}

/** The three settings a content root derives. */
export type Piece = 'microserviceConfig' | 'platformConfig' | 'customPrompts'

export const PIECES: Piece[] = ['microserviceConfig', 'platformConfig', 'customPrompts']

const LABEL: Record<Piece, { noun: string; setting: string }> = {
  microserviceConfig: { noun: 'microservice config', setting: 'aiDevWorkflow.microserviceConfig' },
  platformConfig: { noun: 'platform config', setting: 'aiDevWorkflow.platformConfig' },
  customPrompts: { noun: 'custom prompts folder', setting: 'aiDevWorkflow.customPrompts' },
}

/** Where each piece sits under a content root. The layout a team copies. */
export function derivedFrom(root: string): Record<Piece, string> {
  return {
    microserviceConfig: join(root, 'config', 'microservices.json'),
    platformConfig: join(root, 'config', 'platforms.json'),
    customPrompts: join(root, 'prompts'),
  }
}

/** The content root itself, when it is set and usable. Only the workflows warning needs it. */
export function resolveContentRootSetting(configured: string): string | undefined {
  const value = configured.trim()
  return value !== '' && isAbsolutePath(value) ? value : undefined
}

export type FileResult = { ok: true; path: string } | { ok: false; message: string }

function absoluteOrMessage(setting: string, value: string): FileResult {
  return isAbsolutePath(value)
    ? { ok: true, path: value }
    : { ok: false, message: `${setting} must be an absolute path. Got "${value}".` }
}

/**
 * A piece's path: its own setting if it has one, otherwise derived from the
 * content root. Reading never depends on the derived values having been written
 * into settings, so hand-editing settings.json works and a failed write costs
 * nothing. See spec Section 16.
 */
function pathOf(piece: Piece, s: ContentSettings): FileResult | undefined {
  const own = s[piece].trim()
  if (own !== '') return absoluteOrMessage(LABEL[piece].setting, own)

  const root = s.contentRoot.trim()
  if (root === '') return undefined
  if (!isAbsolutePath(root)) {
    return {
      ok: false,
      message: `aiDevWorkflow.contentRoot must be an absolute path. Got "${root}".`,
    }
  }
  return { ok: true, path: derivedFrom(root)[piece] }
}

/**
 * The two config files are required and do not fall back. The bundled catalogue
 * would name repositories belonging to another team, and gitClone would put
 * them on this developer's disk. See spec Section 16.
 */
export function resolveConfigFile(
  piece: 'microserviceConfig' | 'platformConfig',
  s: ContentSettings,
): FileResult {
  const result = pathOf(piece, s)
  if (result) return result
  return {
    ok: false,
    message:
      `No ${LABEL[piece].noun} configured. Set ${LABEL[piece].setting} in ` +
      'Settings → Extensions → AI Dev Workflow, or set Content Root to fill it in.',
  }
}

export type PromptsResult =
  | { kind: 'none' }
  | { kind: 'dir'; path: string }
  | { kind: 'error'; message: string }

/**
 * Prompts are optional: every template a team has not supplied falls back to
 * the bundled one, per file. So "not configured" is an ordinary outcome here
 * rather than an error — but "configured badly" still is.
 */
export function resolvePromptsDir(s: ContentSettings): PromptsResult {
  const result = pathOf('customPrompts', s)
  if (!result) return { kind: 'none' }
  return result.ok ? { kind: 'dir', path: result.path } : { kind: 'error', message: result.message }
}

export type ResolvedContent =
  | { ok: true; microserviceConfig: string; platformConfig: string; promptsDir?: string }
  | { ok: false; message: string }

/**
 * Every content path a task needs, or the first reason one is unusable.
 *
 * A broken prompts setting stops the task like a broken config file does. The
 * alternative — carrying on with the bundled prompts — is the silent fallback
 * this design exists to avoid. See spec Section 16.
 */
export function resolveAll(s: ContentSettings): ResolvedContent {
  const micro = resolveConfigFile('microserviceConfig', s)
  if (!micro.ok) return micro
  const platform = resolveConfigFile('platformConfig', s)
  if (!platform.ok) return platform

  const prompts = resolvePromptsDir(s)
  if (prompts.kind === 'error') return { ok: false, message: prompts.message }

  return {
    ok: true,
    microserviceConfig: micro.path,
    platformConfig: platform.path,
    promptsDir: prompts.kind === 'dir' ? prompts.path : undefined,
  }
}

/**
 * Which derived values may be written into settings.
 *
 * A field is ours to update if it is empty, or if it still holds exactly what
 * we last wrote there. Anything else the developer put there deliberately, and
 * overwriting it would make a hand-picked prompts folder silently revert the
 * next time the content root changed. See spec Section 16.
 */
export function fieldsToWrite(
  current: Record<Piece, string>,
  derived: Record<Piece, string>,
  lastWritten: Partial<Record<Piece, string>>,
): Partial<Record<Piece, string>> {
  const out: Partial<Record<Piece, string>> = {}
  for (const piece of PIECES) {
    const value = current[piece].trim()
    const ours = value === '' || value === lastWritten[piece]
    if (ours && value !== derived[piece]) out[piece] = derived[piece]
  }
  return out
}

/**
 * A directory listing, injected so resolution can be tested without a disk.
 * `undefined` means the directory is not there — which is an ordinary outcome
 * here, not an error.
 */
export interface DirectoryProbe {
  list(dir: string): Promise<string[] | undefined>
}

export const nodeProbe: DirectoryProbe = {
  async list(dir) {
    try {
      return await readdir(dir)
    } catch {
      return undefined
    }
  },
}

export type TemplateResolver = (workflowId: string, stepId: string) => Promise<ResolvedTemplate>

/**
 * Resolves `<promptsDir>/<workflowId>/<stepId>.md`, falling back to the bundled
 * template of the same name when the team has not supplied one.
 *
 * Fallback is per file on purpose: a team overriding one prompt keeps receiving
 * every other prompt a release adds. The cost is that a misnamed override would
 * be indistinguishable from no override, so the one likely misnaming — a case
 * difference — is refused rather than fallen back from. See spec Section 16.
 *
 * The check is made against a directory listing rather than by trying to open
 * the file, because opening `aiHandoff.md` succeeds on a case-insensitive
 * filesystem even when the file on disk is `aiHandoff.MD`.
 */
export function templateResolver(
  opts: { promptsDir?: string; bundledPromptsDir: string },
  probe: DirectoryProbe,
): TemplateResolver {
  return async (workflowId, stepId) => {
    const expected = `${stepId}.md`
    const bundled: ResolvedTemplate = {
      path: join(opts.bundledPromptsDir, workflowId, expected),
      source: 'bundled',
    }

    if (!opts.promptsDir) return bundled

    const dir = join(opts.promptsDir, workflowId)
    const names = await probe.list(dir)
    if (!names) return bundled

    if (names.includes(expected)) return { path: join(dir, expected), source: 'external' }

    const variant = names.find((n) => n.toLowerCase() === expected.toLowerCase())
    if (variant) {
      throw new Error(`found "${variant}" in ${dir}, expected "${expected}"`)
    }

    return bundled
  }
}

/** Workflows are not configurable; a folder of them is a misunderstanding worth reporting. */
export async function externalWorkflowsPresent(
  root: string,
  probe: DirectoryProbe,
): Promise<boolean> {
  return (await probe.list(join(root, 'workflows'))) !== undefined
}

/** The caption above a composed prompt, so silent fallback is visible on screen. */
export function templateNote(t: ResolvedTemplate): string {
  return `Template: ${t.path} (${t.source === 'external' ? 'external' : 'bundled default'})`
}
