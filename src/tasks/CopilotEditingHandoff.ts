import type { StepDef, StepType } from '../engine/schema'
import type { AuditLog } from '../audit/AuditLog'
import type { Handoff } from '../handoff/ChatHandoff'
import type { PromptComposer } from '../prompt/PromptComposer'
import type { CommandSink } from './CommandSink'
import type { Answers, StepContext, ValidationResult } from './context'
import type { CopilotHandoff, Delivery } from './CopilotHandoff'
import { reposBefore } from './history'
import { composePreview, editedPrompt } from './promptBlock'
import type { TaskType, TaskView } from './TaskType'

/**
 * A handoff whose product is edits to the repositories, not a document.
 *
 * This is where spec D9 has to give. A step that writes a file can require two
 * independent signals — the file appears AND the developer confirms — and the
 * file is the honest one. Here there is no file, so completion rests on the
 * developer's word alone. The prompt is still composed deterministically and
 * logged in full before it leaves, so the audit trail still answers what was
 * asked; it no longer independently corroborates that anything was done.
 *
 * Subclasses differ only in the name a workflow references and the title the
 * developer reads, which is why they are three lines each.
 */
export abstract class CopilotEditingHandoff implements TaskType, CopilotHandoff {
  readonly stepType: StepType = 'aiHandoff'
  /** Same as InvokeCopilot: Send delivers, Done completes. */
  readonly transitions = ['done'] as const
  abstract readonly name: string
  abstract readonly title: string
  /** The sentence under the step, in the imperative the developer will act on. */
  protected abstract readonly instruction: string

  constructor(
    private readonly composer: PromptComposer,
    private readonly handoff: Handoff,
    private readonly audit: AuditLog,
    private readonly sink: CommandSink,
  ) {}

  async describe(step: StepDef, ctx: StepContext, values: Answers): Promise<TaskView> {
    const { block, failure } = await composePreview(
      this.composer,
      step,
      ctx,
      editedPrompt(values),
    )
    return {
      text: failure
        ? `The prompt could not be composed: ${failure}`
        : `${this.instruction} Mark this step done once Copilot has finished and you have looked at what it changed.`,
      commands: block ? [block] : undefined,
      actions: [
        { id: 'send', label: 'Send to Copilot' },
        { id: 'done', label: 'Done', primary: true },
      ],
    }
  }

  async copyPrompt(
    step: StepDef,
    ctx: StepContext,
    override?: string,
  ): Promise<{ label: string; text: string }> {
    const text =
      override ?? (await this.composer.compose(step, ctx, reposBefore(ctx, step.id))).prompt
    await this.sink.copy(text)
    return { label: override ? 'your edited prompt' : 'the composed prompt', text }
  }

  validate(_step: StepDef, values: Answers): ValidationResult {
    if (values.confirmed) return { ok: true, errors: {} }
    return {
      ok: false,
      errors: { confirmed: 'Mark the step done once Copilot has finished.' },
    }
  }

  async deliver(step: StepDef, ctx: StepContext, override?: string): Promise<Delivery> {
    const composed = await this.composer.compose(step, ctx, reposBefore(ctx, step.id))
    const prompt = override ?? composed.prompt

    // Written BEFORE delivery so a crash still leaves the record.
    await this.audit.append({
      kind: 'prompt-composed',
      stepId: step.id,
      data: {
        prompt,
        chars: prompt.length,
        templatePath: composed.templatePath,
        templateSource: composed.templateSource,
        includes: composed.includes,
        references: composed.references,
        unresolved: composed.unresolved,
      },
    })

    const mechanism = await this.handoff.deliver(prompt, ctx.taskDir)

    // After delivery rather than before, because the rung that worked is not
    // knowable until it has. The prompt itself is logged before it leaves; this
    // records what happened to it. Spec Sections 8 and 12 both claimed the
    // mechanism reached the audit log, and until now it only reached the step
    // result in _state.json — which a revise loop overwrites, so the question
    // V1 asks could not have been answered from a session log.
    await this.audit.append({
      kind: 'prompt-delivered',
      stepId: step.id,
      data: { mechanism, chars: prompt.length },
    })

    return { mechanism, promptChars: prompt.length }
  }

  async execute(
    _step: StepDef,
    _ctx: StepContext,
    values: Answers,
  ): Promise<Record<string, unknown>> {
    return { mechanism: values.mechanism ?? null, confirmedByDeveloper: true }
  }
}
