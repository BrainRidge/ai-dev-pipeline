import { basename } from 'node:path'
import type { StepDef } from '../engine/schema'
import type { Answers, StepContext, ValidationResult } from './context'
import type { TaskType, TaskView } from './TaskType'

/**
 * Review happens in a real editor tab, not in the panel. That is why editing a
 * generated artifact works with no additional implementation, and why we do not
 * reimplement an editor badly. See spec Section 9.
 *
 * Which artifact to review is not declared anywhere: it is whatever the most
 * recent step before this one produced. That keeps the primitive generic and
 * keeps workflow authors from having to repeat a filename in two places.
 */
export class ManualReview implements TaskType {
  readonly name = 'manualReview'
  readonly stepType = 'manual' as const
  readonly title = 'Review the result'

  constructor(
    private readonly openFile: (path: string) => Promise<void>,
    private readonly hashFile: (path: string) => Promise<string>,
  ) {}

  async describe(step: StepDef, ctx: StepContext, _values: Answers): Promise<TaskView> {
    const path = this.artifactPath(step, ctx)
    return {
      text: path
        ? `${basename(path)} is open in an editor tab. Read it, edit it if you want to, ` +
          `then approve it or send it back for another pass.`
        : 'No earlier step has produced an artifact to review yet.',
      actions: [
        { id: 'revise', label: 'Revise' },
        { id: 'approve', label: 'Approve', primary: true },
      ],
    }
  }

  validate(): ValidationResult {
    return { ok: true, errors: {} }
  }

  async open(step: StepDef, ctx: StepContext): Promise<void> {
    const path = this.artifactPath(step, ctx)
    if (path) await this.openFile(path)
  }

  async execute(
    step: StepDef,
    ctx: StepContext,
    _values: Answers,
  ): Promise<Record<string, unknown>> {
    const artifactPath = this.artifactPath(step, ctx)
    if (!artifactPath) return { approved: true }
    return { artifactPath, artifactHash: await this.hashFile(artifactPath), approved: true }
  }

  /** The nearest artifact behind this step in the traversal order. */
  artifactPath(step: StepDef, ctx: StepContext): string | undefined {
    const index = ctx.order.indexOf(step.id)
    const behind = index < 0 ? ctx.order : ctx.order.slice(0, index)
    for (const id of [...behind].reverse()) {
      const produced = ctx.resultOf(id).outputPath
      if (typeof produced === 'string' && produced.length > 0) return produced
    }
    return undefined
  }
}
