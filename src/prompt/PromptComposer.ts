import { access, readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { parse } from 'yaml'
import type { StepDef } from '../engine/schema'
import type { StepContext } from '../tasks/context'
import { resolveText, unresolvedIn } from '../engine/placeholders'
import { normalisePromptName } from '../engine/WorkflowCatalog'
import type { ResolvedTemplate, TemplateResolver, TemplateSource } from '../content/ContentRoot'

/** A file the prompt points Copilot at, rather than one it quotes. */
export interface PromptReference {
  path: string
  /** False means the `#file:` was still emitted but nothing is there to read. */
  found: boolean
}

export interface ComposedPrompt {
  prompt: string
  /**
   * The artifact the model is contracted to write, relative to the task dir.
   * Absent for a handoff that produces edits rather than a document.
   */
  outputFile?: string
  /** Which file this prompt was built from, and whose it was. See spec Section 16. */
  templatePath: string
  templateSource: TemplateSource
  /**
   * The prompts the *workflow* declared for this step — personas and skills —
   * composed ahead of the step's own template, in declared order.
   * See spec Section 6.
   */
  prompts: ResolvedTemplate[]
  /** Templates the *template* pulled in, quoted after it. See spec Section 8. */
  includes: ResolvedTemplate[]
  /** Files the prompt names for Copilot to open itself. */
  references: PromptReference[]
  /**
   * Placeholders that named something this run does not have, so they rendered
   * as nothing. Empty on a correct template. See spec Section 8.
   */
  unresolved: string[]
}

interface Template {
  body: string
  outputFile?: string
  include: string[]
  reference: string[]
  path: string
  source: TemplateSource
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/** Keys only a step's own template may declare. See spec Section 8. */
const OWNER_KEYS = ['output', 'include', 'reference'] as const

/**
 * Assembles the prompt deterministically in five parts (spec Section 8):
 *   1. template body, then any included templates
 *   2. workspace path map
 *   3. scope constraint
 *   4. further reading, when the template names any
 *   5. output contract
 *
 * Parts 2-5 are generated here, so prompt authors write only the thinking and
 * never have to remember the boilerplate that makes it work.
 *
 * Determinism is the point: the same workflow, answers and extension version
 * must produce a byte-identical prompt. That is what makes the process
 * standardised rather than merely documented.
 *
 * A template is found by convention at `<workflowId>/<stepId>.md`, which is why
 * adding a workflow needs a JSON file and a markdown file but no TypeScript.
 * Which directory that convention is applied to — the team's content folder or
 * the extension's own — is the resolver's decision, not this class's.
 * See spec Section 16.
 */
export class PromptComposer {
  constructor(private readonly resolve: TemplateResolver) {}

  /**
   * Which template this step will use, and whether it is the team's or the
   * bundled default — without reading or composing it. The panel needs this to
   * caption the prompt, and `InvokeCopilot` needs it to name the file in an
   * error. See spec Section 16.
   */
  async resolved(step: StepDef, ctx: StepContext): Promise<ResolvedTemplate> {
    // A step may name its template, and the bundled workflows now all do. The
    // convention remains the default rather than the only way: a workflow that
    // says nothing still resolves <workflowId>/<stepId>.md, so nothing had to be
    // migrated and a new workflow can still be one JSON file and one markdown
    // file. See spec Sections 6 and 8.
    const named = step.prompt !== undefined ? normalisePromptName(step.prompt) : undefined
    return this.resolve(named ?? join(ctx.workflowId, `${step.id}.md`))
  }

  /**
   * The artifact name is frontmatter rather than code, because which file a
   * handoff produces is the prompt author's decision — the same decision as
   * what the prompt asks for, and it belongs in the same file.
   *
   * Throws for a template that declares none: a step whose completion depends
   * on a file appearing (spec D9) cannot proceed without knowing its name.
   */
  async outputFor(step: StepDef, ctx: StepContext): Promise<string> {
    const { outputFile, path } = await this.template(step, ctx)
    if (!outputFile) {
      throw new Error(`prompt template "${path}" must declare "output:" in its frontmatter`)
    }
    return outputFile
  }

  async compose(
    step: StepDef,
    ctx: StepContext,
    repos: { name: string; path: string }[],
  ): Promise<ComposedPrompt> {
    const main = await this.template(step, ctx)
    // Declared in the workflow rather than in the template, so a step can be
    // given a persona without the persona having to know which steps use it.
    const declared = await this.readParts(step.prompts, main.path, 'prompts')
    const included = await this.readIncludes(main)
    const references = await this.resolveReferences(main, ctx)

    // Checked before substitution, since afterwards there is nothing left to
    // see: an unresolved placeholder becomes an empty string. Included files are
    // checked too — a typo is no less likely in a file three workflows share.
    const authored = [...declared.map((d) => d.body), main.body, ...included.map((i) => i.body)]
    const unresolved = [...new Set(authored.flatMap((body) => unresolvedIn(body, ctx)))]

    // Part 1, in three groups, and the order is the argument for having two
    // mechanisms rather than one:
    //
    //   the workflow's prompts   who the model is being asked to be
    //   the step's own template  what it is being asked to do, from the answers
    //   the template's includes  constraints on how, shared across steps
    //
    // A persona has to be read before the task it applies to, and a house rule
    // reads naturally after the work has been described. See spec Sections 6
    // and 8.
    const part1 = [
      ...declared.map((d) => resolveText(d.body, ctx).trimEnd()),
      resolveText(main.body, ctx).trimEnd(),
      ...included.map((i) => resolveText(i.body, ctx).trimEnd()),
    ].join('\n\n')

    const part2 = [
      '',
      '## Repositories in scope',
      '',
      ...repos.map((r) => `- **${r.name}** — \`${r.path}\` #file:${r.path}`),
    ].join('\n')

    const part3 = [
      '',
      '## Scope',
      '',
      'Work only within the repositories listed above. Do not modify files elsewhere.',
    ].join('\n')

    // Part 4 exists only when the template names something. A reference that is
    // not on disk is still emitted: what is sent must be what the panel shows,
    // and the caption is where the developer is told it is missing.
    const part4 =
      references.length > 0
        ? [
            '',
            '## Further reading',
            '',
            'Read these before you start:',
            ...references.map((r) => `- #file:${r.path}`),
          ].join('\n')
        : ''

    // Part 5 exists only when the template declares an artifact. A handoff that
    // edits code has no file to contract for, and inventing one would put a
    // false promise in the audit log.
    const part5 = main.outputFile
      ? [
          '',
          '## Required output',
          '',
          `Write your result to \`${join(ctx.taskDir, main.outputFile)}\`.`,
          'Create the file if it does not exist. Do not write your result anywhere else.',
        ].join('\n')
      : ['', '## Required output', '', 'Change the code in place. Do not write a summary file.'].join(
          '\n',
        )

    return {
      prompt: [part1, part2, part3, ...(part4 ? [part4] : []), part5, ''].join('\n'),
      outputFile: main.outputFile,
      templatePath: main.path,
      templateSource: main.source,
      prompts: declared.map(({ path, source }) => ({ path, source })),
      includes: included.map(({ path, source }) => ({ path, source })),
      references,
      unresolved,
    }
  }

  /**
   * The templates a prompt quotes, in declared order.
   *
   * A missing include is fatal, unlike a missing reference: its text is part of
   * what is being asked, and dropping it would silently change the prompt while
   * the panel still showed a caption saying it was there.
   */
  private async readIncludes(
    main: Template,
  ): Promise<{ body: string; path: string; source: TemplateSource }[]> {
    return this.readParts(main.include, main.path, 'include')
  }

  /**
   * Reads a list of prompt files and returns their bodies, in order.
   *
   * Shared by the workflow's `prompts` and a template's `include:` because the
   * reading is identical — the same resolution, the same per-file fallback, the
   * same refusal to nest. Only where the text lands differs, and that is the
   * caller's business.
   */
  private async readParts(
    names: string[],
    declaredIn: string,
    key: 'prompts' | 'include',
  ): Promise<{ body: string; path: string; source: TemplateSource }[]> {
    const out: { body: string; path: string; source: TemplateSource }[] = []

    for (const name of names) {
      const resolved = await this.resolve(promptsRelative(name, declaredIn, key))

      let raw: string
      try {
        raw = await readFile(resolved.path, 'utf8')
      } catch {
        throw new Error(
          `"${declaredIn}" ${key === 'prompts' ? 'is given' : 'includes'} the prompt ` +
            `"${name}", which was not found at ${resolved.path}`,
        )
      }

      // One level only. An included file that pulled in more would need cycle
      // detection to be safe, and no bundled prompt has ever wanted it.
      const meta = frontmatterOf(raw)
      const owner = OWNER_KEYS.find((key) => meta?.[key] !== undefined)
      if (owner) {
        throw new Error(
          `included template "${resolved.path}" declares "${owner}:", which only a step's ` +
            `own template may do`,
        )
      }

      out.push({ body: stripFrontmatter(raw), path: resolved.path, source: resolved.source })
    }

    return out
  }

  /**
   * The files the prompt points Copilot at.
   *
   * Placeholders are resolved first, so a template can name a document inside a
   * repository the task has just cloned — `{{task.workDir}}/party-service/…`.
   * An absolute result is used as it stands; anything else is a name under the
   * prompts root, resolved with the same fallback as a template.
   */
  private async resolveReferences(main: Template, ctx: StepContext): Promise<PromptReference[]> {
    const out: PromptReference[] = []

    for (const entry of main.reference) {
      const resolvedText = resolveText(entry, ctx).trim()
      if (resolvedText === '') continue

      const path = isAbsolute(resolvedText)
        ? resolvedText
        : (await this.resolve(promptsRelative(resolvedText, main.path, 'reference'))).path

      out.push({ path, found: await exists(path) })
    }

    return out
  }

  private async template(step: StepDef, ctx: StepContext): Promise<Template> {
    const { path, source } = await this.resolved(step, ctx)
    const raw = await readFile(path, 'utf8')

    const match = FRONTMATTER.exec(raw)
    if (!match) {
      return { body: raw, include: [], reference: [], path, source }
    }

    const meta = parse(match[1]!) as Record<string, unknown> | null
    const declared = meta?.output
    if (declared !== undefined && (typeof declared !== 'string' || declared.trim() === '')) {
      throw new Error(`prompt template "${path}" declares an unusable "output:" value`)
    }

    return {
      body: raw.slice(match[0].length),
      outputFile: typeof declared === 'string' ? declared.trim() : undefined,
      include: stringList(meta?.include, path, 'include'),
      reference: stringList(meta?.reference, path, 'reference'),
      path,
      source,
    }
  }
}

function frontmatterOf(raw: string): Record<string, unknown> | null {
  const match = FRONTMATTER.exec(raw)
  if (!match) return null
  return (parse(match[1]!) as Record<string, unknown> | null) ?? null
}

function stripFrontmatter(raw: string): string {
  const match = FRONTMATTER.exec(raw)
  return match ? raw.slice(match[0].length) : raw
}

/** A frontmatter list, or a precise complaint about what was written instead. */
function stringList(value: unknown, path: string, key: string): string[] {
  if (value === undefined || value === null) return []
  // A single string is accepted: one file is the common case and writing it as
  // a list is the kind of ceremony that makes a format feel unfriendly.
  const items = Array.isArray(value) ? value : [value]

  return items.map((item) => {
    if (typeof item !== 'string' || item.trim() === '') {
      throw new Error(`prompt template "${path}" has an unusable entry under "${key}:"`)
    }
    return item.trim()
  })
}

/**
 * A name under the prompts root.
 *
 * A leading slash is allowed and stripped: `/skills/java-expert.md` reads as a
 * path from the top of the prompts folder, which is how a workflow author
 * naturally writes one, and it is never a filesystem path. What is refused is a
 * genuinely absolute path — `C:\…`, a UNC share — and any `..`, so that every
 * quoted file is either the team's or the bundled default. That is what makes
 * the caption above the prompt and the audit entry mean anything.
 */
function promptsRelative(name: string, declaredIn: string, key: string): string {
  const trimmed = name.trim().replace(/^\/+/, '')

  const windowsAbsolute = /^[A-Za-z]:/.test(trimmed) || name.trim().startsWith('\\\\')
  if (trimmed === '' || windowsAbsolute || isAbsolute(trimmed) || trimmed.split(/[\\/]/).includes('..')) {
    throw new Error(
      `"${declaredIn}" names "${name}" under "${key}". Use a path inside the prompts ` +
        `folder, such as "/skills/java-expert.md".`,
    )
  }
  return trimmed
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
