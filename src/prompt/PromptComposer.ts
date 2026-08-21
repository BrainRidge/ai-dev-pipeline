import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import type { StepDef } from '../engine/schema'
import type { StepContext } from '../tasks/context'
import { resolveText } from '../engine/placeholders'
import type { ResolvedTemplate, TemplateResolver, TemplateSource } from '../content/ContentRoot'

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
}

interface Template {
  body: string
  outputFile?: string
  path: string
  source: TemplateSource
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/**
 * Assembles the prompt deterministically in four parts (spec Section 8):
 *   1. template body   2. workspace path map
 *   3. scope constraint  4. output contract
 *
 * Parts 2-4 are generated here, so prompt authors write only the thinking and
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
    return this.resolve(ctx.workflowId, step.id)
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
    const { body, outputFile, path, source } = await this.template(step, ctx)

    const part1 = resolveText(body, ctx)

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

    // Part 4 exists only when the template declares an artifact. A handoff that
    // edits code has no file to contract for, and inventing one would put a
    // false promise in the audit log.
    const part4 = outputFile
      ? [
          '',
          '## Required output',
          '',
          `Write your result to \`${join(ctx.taskDir, outputFile)}\`.`,
          'Create the file if it does not exist. Do not write your result anywhere else.',
        ].join('\n')
      : ['', '## Required output', '', 'Change the code in place. Do not write a summary file.'].join(
          '\n',
        )

    return {
      prompt: [part1.trimEnd(), part2, part3, part4, ''].join('\n'),
      outputFile,
      templatePath: path,
      templateSource: source,
    }
  }

  private async template(step: StepDef, ctx: StepContext): Promise<Template> {
    const { path, source } = await this.resolved(step, ctx)
    const raw = await readFile(path, 'utf8')

    const match = FRONTMATTER.exec(raw)
    if (!match) return { body: raw, path, source }

    const meta = parse(match[1]!) as { output?: unknown } | null
    const declared = meta?.output
    if (declared !== undefined && (typeof declared !== 'string' || declared.trim() === '')) {
      throw new Error(`prompt template "${path}" declares an unusable "output:" value`)
    }

    return {
      body: raw.slice(match[0].length),
      outputFile: typeof declared === 'string' ? declared.trim() : undefined,
      path,
      source,
    }
  }
}
