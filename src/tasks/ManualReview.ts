import { basename, join } from 'node:path'
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
  /** Revise is handled by the engine, since it moves backwards. */
  readonly transitions = ['approve'] as const

  constructor(
    private readonly openFile: (path: string) => Promise<void>,
    private readonly hashFile: (path: string) => Promise<string>,
    /**
     * Copies the approved artifact somewhere it will not be edited, creating
     * any directory it needs. Injected so approval can be tested without a
     * disk, and so the copying is somebody else's business.
     */
    private readonly keepCopy: (from: string, to: string) => Promise<void>,
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

  /**
   * Approval keeps a copy, not just a hash.
   *
   * Spec Section 8 recorded the gap: the hash proves the file was not altered
   * after approval, but it cannot reconstruct what was approved — and the
   * artifact lives at the root of the task folder, which the developer is
   * invited to open and edit. A later edit therefore left an audit trail that
   * could prove something had changed and nothing about what it used to say.
   *
   * The copy goes under `.engine/`, away from the files the developer works on,
   * and is named after the step so a second pass through the same review does
   * not overwrite the first — it is a record, and a record that can be
   * overwritten is not one.
   */
  async execute(
    step: StepDef,
    ctx: StepContext,
    _values: Answers,
  ): Promise<Record<string, unknown>> {
    const artifactPath = this.artifactPath(step, ctx)
    if (!artifactPath) return { approved: true }

    const approvedCopy = join(ctx.taskDir, '.engine', 'approved', `${step.id}-${basename(artifactPath)}`)

    // A failure here must not cost the developer their approval: the hash is
    // still recorded, and the panel would otherwise refuse a step for a reason
    // that has nothing to do with the work.
    const kept = await this.keepCopy(artifactPath, approvedCopy).then(
      () => true,
      () => false,
    )

    return {
      artifactPath,
      artifactHash: await this.hashFile(artifactPath),
      approvedCopy: kept ? approvedCopy : null,
      approved: true,
    }
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
