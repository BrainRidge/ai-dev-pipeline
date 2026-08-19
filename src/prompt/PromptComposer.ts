import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import type { StepDef } from '../engine/schema'
import type { StepContext } from '../tasks/context'
import { resolveText } from '../engine/placeholders'

export interface ComposedPrompt {
  prompt: string
  /**
   * The artifact the model is contracted to write, relative to the task dir.
   * Absent for a handoff that produces edits rather than a document.
   */
  outputFile?: string
}

interface Template {
  body: string
  outputFile?: string
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
 */
export class PromptComposer {
  constructor(private readonly templateDir: string) {}

  /**
   * The artifact name is frontmatter rather than code, because which file a
   * handoff produces is the prompt author's decision — the same decision as
   * what the prompt asks for, and it belongs in the same file.
   *
   * Throws for a template that declares none: a step whose completion depends
   * on a file appearing (spec D9) cannot proceed without knowing its name.
   */
  async outputFor(step: StepDef, ctx: StepContext): Promise<string> {
    const { outputFile } = await this.template(step, ctx)
    if (!outputFile) {
      throw new Error(
        `prompt template "${this.path(step, ctx)}" must declare "output:" in its frontmatter`,
      )
    }
    return outputFile
  }

  async compose(
    step: StepDef,
    ctx: StepContext,
    repos: { name: string; path: string }[],
  ): Promise<ComposedPrompt> {
    const { body, outputFile } = await this.template(step, ctx)

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
    }
  }

  path(step: StepDef, ctx: StepContext): string {
    return join(this.templateDir, ctx.workflowId, `${step.id}.md`)
  }

  private async template(step: StepDef, ctx: StepContext): Promise<Template> {
    const path = this.path(step, ctx)
    const raw = await readFile(path, 'utf8')

    const match = FRONTMATTER.exec(raw)
    if (!match) return { body: raw }

    const meta = parse(match[1]!) as { output?: unknown } | null
    const declared = meta?.output
    if (declared !== undefined && (typeof declared !== 'string' || declared.trim() === '')) {
      throw new Error(`prompt template "${path}" declares an unusable "output:" value`)
    }

    return {
      body: raw.slice(match[0].length),
      outputFile: typeof declared === 'string' ? declared.trim() : undefined,
    }
  }
}
