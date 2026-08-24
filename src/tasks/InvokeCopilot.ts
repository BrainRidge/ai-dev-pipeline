import { basename, join } from 'node:path'
import type { StepDef } from '../engine/schema'
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
 * Composes the prompt and hands it to Copilot. The extension orchestrates; the
 * chat executes (spec D1), so nothing past the handoff boundary is auditable —
 * which is exactly why the composed prompt is logged in full before it leaves.
 */
export class InvokeCopilot implements TaskType, CopilotHandoff {
  readonly name = 'invokeCopilot'
  readonly stepType = 'aiHandoff' as const
  readonly title = 'Hand off to Copilot'
  /** Send delivers the prompt; Done is what completes the step (spec D9). */
  readonly transitions = ['done'] as const

  constructor(
    private readonly composer: PromptComposer,
    private readonly handoff: Handoff,
    private readonly audit: AuditLog,
    private readonly fileExists: (p: string) => Promise<boolean>,
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
        : 'Read the prompt below — edit it if you want to — send it to Copilot, then ' +
          'mark this step done once the output file has been written.',
      commands: block ? [block] : undefined,
      actions: [
        { id: 'send', label: 'Send to Copilot' },
        { id: 'done', label: 'Done', primary: true },
      ],
    }
  }

  /** The same prompt the panel shows — including the developer's edits to it. */
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

  /**
   * Both conditions are required (spec D9). The watcher alone is not enough —
   * Copilot may write the file and keep working. The click alone is not enough
   * — developers click things.
   */
  validate(_step: StepDef, values: Answers): ValidationResult {
    const errors: Record<string, string> = {}
    if (!values.confirmed) {
      errors.confirmed = 'Mark the step done once Copilot has finished.'
    }
    if (!values.outputPresent) {
      const name = typeof values.outputFile === 'string' ? values.outputFile : 'The output file'
      errors.output = `${name} has not been written yet. Reopen the chat and try again.`
    }
    return { ok: Object.keys(errors).length === 0, errors }
  }

  /** Where this step's artifact will land. Needed by the watcher and the review step. */
  async outputPath(step: StepDef, ctx: StepContext): Promise<string> {
    return join(ctx.taskDir, await this.composer.outputFor(step, ctx))
  }

  /**
   * Looks. The watcher in `TaskSession` reports the artifact appearing while the
   * developer waits, which is what makes the panel stop saying "waiting for
   * 02-analysis.md" on its own — but a live event is not the same fact as the
   * file being there, and it is missed often enough to matter: a task folder
   * outside the workspace is watched non-recursively and best-effort, a write
   * can land before anything is listening, and a symlinked path compares
   * unequal. Every one of those left Done refusing with the file plainly on
   * disk. See spec D9 and Section 8.
   */
  async artifactPresent(step: StepDef, ctx: StepContext): Promise<boolean> {
    return this.fileExists(await this.outputPath(step, ctx))
  }

  async deliver(step: StepDef, ctx: StepContext, override?: string): Promise<Delivery> {
    const composed = await this.composer.compose(step, ctx, reposBefore(ctx, step.id))
    const { outputFile, templatePath, templateSource } = composed

    // The developer's text wins, but the artifact contract does not: which file
    // this step waits for is the template's decision, not the prompt's wording.
    const prompt = override ?? composed.prompt
    if (!outputFile) {
      const { path } = await this.composer.resolved(step, ctx)
      throw new Error(
        `prompt template "${path}" must declare "output:" — ` +
          `step "${step.id}" completes only when that file appears`,
      )
    }

    // Written BEFORE delivery so a crash still leaves the record. `includes`
    // are already inside `prompt` verbatim; recording their paths says whose
    // wording it was. `references` are the one thing the log names without
    // holding — see spec Section 8.
    await this.audit.append({
      kind: 'prompt-composed',
      stepId: step.id,
      data: {
        prompt,
        chars: prompt.length,
        outputFile,
        templatePath,
        templateSource,
        prompts: composed.prompts,
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

    return { mechanism, promptChars: prompt.length, outputPath: join(ctx.taskDir, outputFile) }
  }

  async execute(
    step: StepDef,
    ctx: StepContext,
    values: Answers,
  ): Promise<Record<string, unknown>> {
    const outputPath = await this.outputPath(step, ctx)
    return {
      outputPath,
      outputFile: basename(outputPath),
      outputPresent: await this.fileExists(outputPath),
      mechanism: values.mechanism ?? null,
    }
  }
}
