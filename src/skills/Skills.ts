import { parse } from 'yaml'
import type { TemplateSource } from '../content/ContentRoot'

/**
 * Where VS Code looks for a developer's own Agent Skills. There are three; this
 * is the Copilot-flavoured one, and writing to more than one would install the
 * same skill several times over. See spec Section 18.
 */
export const USER_SKILLS_DIR = '.copilot/skills'

/** Agent Skills arrived in VS Code 1.108. Below that, installing one does nothing. */
export const MINIMUM_VSCODE = '1.108'

/** A skill file as it exists in a prompts folder, before installation. */
export interface SkillSource {
  /** Derived from the filename: `codebase-analyst.md` is `codebase-analyst`. */
  name: string
  path: string
  source: TemplateSource
  body: string
}

export type SkillStatus =
  | 'installed'
  | 'unchanged'
  | 'changed-by-you'
  | 'unusable'
  | 'unsupported'

export interface SkillFinding {
  name: string
  status: SkillStatus
  detail: string
  /** Where it was written, when it was. */
  path?: string
}

/**
 * A skill name has to be lowercase letters, numbers and hyphens — VS Code's
 * rule, not ours. Derived from the filename rather than declared, which is the
 * same convention prompt templates already follow: one source of truth, and
 * renaming the file renames the skill.
 */
export function skillNameOf(filename: string): string {
  return filename.replace(/\.md$/i, '')
}

export function nameProblem(name: string): string | undefined {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    return `"${name}" cannot be a skill name. VS Code allows lowercase letters, numbers and ` +
      `hyphens, so rename the file to something like "codebase-analyst.md".`
  }
  return undefined
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/**
 * The description a skill file declares, or why it has none.
 *
 * Required, and deliberately not derived from the first line of the body. The
 * description is what the model matches on to decide whether a skill is relevant
 * — it is the trigger, not a summary — so guessing one would quietly decide when
 * somebody's skill fires. Better to refuse and say so.
 */
export function descriptionOf(raw: string): { description: string } | { problem: string } {
  const match = FRONTMATTER.exec(raw)
  if (!match) {
    return {
      problem:
        'it declares no frontmatter. A skill needs a `description:` saying what it does and ' +
        'when to use it, because that is what Copilot matches on to decide whether to load it.',
    }
  }

  // A malformed block is one file's problem, not the folder's. Letting it throw
  // would collapse the whole skills report into a single error and hide which
  // file caused it — the same reasoning that makes an unreadable task folder a
  // skip rather than a failure. See spec Section 7.
  let meta: { description?: unknown } | null
  try {
    meta = parse(match[1]!) as { description?: unknown } | null
  } catch (err) {
    return {
      problem: `its frontmatter is not valid YAML: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const declared = meta?.description

  if (typeof declared !== 'string' || declared.trim() === '') {
    return {
      problem:
        'its frontmatter declares no usable `description:`. That line is what Copilot matches ' +
        'on to decide whether to load the skill, so it cannot be guessed.',
    }
  }

  return { description: declared.trim() }
}

/** The body with any frontmatter removed, which is what the skill instructs. */
export function bodyOf(raw: string): string {
  const match = FRONTMATTER.exec(raw)
  return match ? raw.slice(match[0].length) : raw
}

/**
 * The SKILL.md an installed skill consists of.
 *
 * Written rather than copied, because the source file's frontmatter is the
 * extension's own format and a skill's is VS Code's. `name` is required there
 * and derived here; `description` is carried across verbatim.
 */
export function skillDocument(skill: { name: string; description: string; body: string }): string {
  return [
    '---',
    `name: ${skill.name}`,
    `description: ${skill.description}`,
    '---',
    skill.body.trimEnd(),
    '',
  ].join('\n')
}

/** Numeric, segment by segment, like the tool version check. */
export function supportsSkills(vscodeVersion: string, minimum = MINIMUM_VSCODE): boolean {
  const a = vscodeVersion.split('.').map((n) => Number.parseInt(n, 10))
  const b = minimum.split('.').map((n) => Number.parseInt(n, 10))
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (Number.isNaN(av)) return false
    if (av !== bv) return av > bv
  }
  return true
}

/**
 * What to do about one skill, given what is already on disk.
 *
 * The rule for overwriting is the one spec Section 16 established for writing
 * derived paths into somebody's settings, and for the same reason: **a file is
 * ours to update only if it is absent, or still holds exactly what we last wrote
 * there.** Anything else the developer edited, and silently reverting a skill
 * they tuned would be the one bug this feature could introduce that nobody would
 * think to look for.
 */
export function decide(
  skill: SkillSource,
  description: string,
  onDisk: string | undefined,
  lastWritten: string | undefined,
): { finding: SkillFinding; write?: string } {
  const wanted = skillDocument({ name: skill.name, description, body: skill.body })

  if (onDisk === undefined) {
    return {
      write: wanted,
      finding: { name: skill.name, status: 'installed', detail: describeSource(skill) },
    }
  }

  if (onDisk === wanted) {
    return {
      finding: { name: skill.name, status: 'unchanged', detail: describeSource(skill) },
    }
  }

  if (lastWritten !== undefined && onDisk === lastWritten) {
    return {
      write: wanted,
      finding: { name: skill.name, status: 'installed', detail: `updated — ${describeSource(skill)}` },
    }
  }

  return {
    finding: {
      name: skill.name,
      status: 'changed-by-you',
      detail:
        'this skill has been edited since it was installed, so it was left alone. Delete it to ' +
        'take the version from your prompts folder again.',
    },
  }
}

function describeSource(skill: SkillSource): string {
  return skill.source === 'external' ? "from your team's prompts folder" : 'from the bundled skills'
}

/** A skill file as read off disk, before it is known to be usable. */
export interface SkillFile {
  name: string
  path: string
  source: TemplateSource
  raw: string
}

export interface SkillPlan {
  findings: SkillFinding[]
  /** Skill name to the SKILL.md that should be written for it. */
  writes: Record<string, string>
}

/**
 * What installing these skills would do, decided without touching a disk.
 *
 * Everything that can go wrong is a finding rather than an exception: a skill
 * that cannot be installed must not stop a developer working, because the
 * persona text still reaches Copilot through the composed prompt
 * ([Section 6](../../docs/spec/06-workflow-schema.md)). Installing it only adds
 * the ability for Copilot to reach for it again later in the conversation.
 */
export function planSkills(
  files: SkillFile[],
  onDisk: Record<string, string | undefined>,
  lastWritten: Record<string, string>,
): SkillPlan {
  const plan: SkillPlan = { findings: [], writes: {} }

  for (const file of files) {
    const badName = nameProblem(file.name)
    if (badName) {
      plan.findings.push({ name: file.name, status: 'unusable', detail: badName })
      continue
    }

    const described = descriptionOf(file.raw)
    if ('problem' in described) {
      plan.findings.push({
        name: file.name,
        status: 'unusable',
        detail: `${file.path} could not be installed: ${described.problem}`,
      })
      continue
    }

    const { finding, write } = decide(
      { name: file.name, path: file.path, source: file.source, body: bodyOf(file.raw) },
      described.description,
      onDisk[file.name],
      lastWritten[file.name],
    )

    plan.findings.push(finding)
    if (write !== undefined) plan.writes[file.name] = write
  }

  return plan
}

/** The report lines for the skills half of the step. See spec Section 18. */
export function skillLines(dir: string, findings: SkillFinding[], supported: boolean): string[] {
  if (!supported) {
    return [
      `Skills  –  this version of VS Code does not load Agent Skills (needs ${MINIMUM_VSCODE} or newer)`,
    ]
  }
  if (findings.length === 0) {
    return ['Skills  –  no skill files found, so none were installed']
  }

  const width = Math.max(...findings.map((f) => f.name.length))
  const lines = findings.map((f) => `${f.name.padEnd(width)}  ${MARK[f.status]}  ${WORD[f.status]}`)

  lines.push('', `Installed to ${dir}`)

  for (const f of findings.filter((f) => f.status === 'unusable' || f.status === 'changed-by-you')) {
    lines.push('', `${f.name} — ${f.detail}`)
  }

  return lines
}

const MARK: Record<SkillStatus, string> = {
  installed: '✓',
  unchanged: '✓',
  'changed-by-you': '⚠',
  unusable: '✗',
  unsupported: '–',
}

const WORD: Record<SkillStatus, string> = {
  installed: 'installed',
  unchanged: 'already installed',
  'changed-by-you': 'yours — left alone',
  unusable: 'could not be installed',
  unsupported: 'not supported here',
}
