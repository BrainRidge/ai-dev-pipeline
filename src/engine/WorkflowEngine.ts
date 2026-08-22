import type { StepDef, WorkflowDef } from './schema'
import type { TaskState, TaskStateStore } from '../state/TaskStateStore'
import type { Answers, StepContext } from '../tasks/context'
import type { TaskType, TaskTypeRegistry } from '../tasks/TaskType'

export type TransitionResult =
  | { ok: true; done: boolean }
  | { ok: false; errors: Record<string, string> }

/**
 * Holds no authoritative state in memory — every transition is written to disk
 * before the caller sees it. Never touches the filesystem or git directly; it
 * works through the store and the task types. See spec Section 5.
 *
 * Traversal is by `nextStep`: the workflow is a graph, and the engine only ever
 * asks a step where it goes next. `order` — the walk from `initialStep`
 * computed at load time — is used for going backwards, which a graph of
 * forward edges cannot answer on its own.
 */
export class WorkflowEngine {
  constructor(
    private readonly workflow: WorkflowDef,
    private readonly store: TaskStateStore,
    private readonly registry: TaskTypeRegistry,
    private readonly ctx: StepContext,
  ) {}

  async state(): Promise<TaskState> {
    return this.store.read()
  }

  async current(): Promise<StepDef> {
    return this.stepById((await this.store.read()).currentStepId)
  }

  /**
   * Reopen a step. Everything after it becomes pending, because later steps
   * were answered on the basis of what this one said. Their answers are kept
   * so they prefill on the way back through.
   */
  async edit(stepId: string): Promise<void> {
    const state = await this.store.read()
    this.reopen(state, stepId)
    await this.store.write(state)
  }

  /**
   * Keep a draft on a step without finishing it — an edited prompt the
   * developer has not yet acted on. Status and position are untouched, so this
   * can never advance or reopen a step by accident.
   */
  async saveAnswers(stepId: string, answers: Answers): Promise<void> {
    const step = this.stepById(stepId)
    const state = await this.store.read()
    const record = state.steps[step.id] ?? { status: 'in_progress' as const }
    state.steps[step.id] = { ...record, answers: { ...record.answers, ...answers } }
    await this.store.write(state)
  }

  async submit(stepId: string, actionId: string, values: Answers): Promise<TransitionResult> {
    const state = await this.store.read()
    const step = this.stepById(stepId)
    const task = this.taskFor(step)

    // Revise sends the work back to whatever produced it — the step before
    // this one — and reopens everything from there.
    if (actionId === 'revise') {
      this.reopen(state, this.previousId(step.id) ?? step.id)
      await this.store.write(state)
      return { ok: true, done: false }
    }

    if (actionId === 'back') {
      const previous = this.previousId(step.id)
      if (previous) {
        state.currentStepId = previous
        await this.store.write(state)
      }
      return { ok: true, done: false }
    }

    // Only an action the primitive nominates may complete a step. This used to
    // fall through — anything not named above was treated as a submission — so
    // an affordance whose handler nobody wrote silently advanced the workflow
    // instead of doing nothing. Reported rather than thrown, so it surfaces on
    // the step as a defect the developer can report rather than as a dead panel.
    if (!task.transitions.includes(actionId)) {
      return {
        ok: false,
        errors: {
          action:
            `"${actionId}" does not complete this step. ${task.name} completes on ` +
            `${task.transitions.map((t) => `"${t}"`).join(' or ')}. This is a defect in the ` +
            `extension rather than anything you did.`,
        },
      }
    }

    const validation = task.validate(step, values)
    if (!validation.ok) return { ok: false, errors: validation.errors }

    const result = await task.execute(step, this.ctx, values)
    state.steps[step.id] = { status: 'complete', answers: values, result }
    state.currentStepId = step.nextStep ?? step.id

    // Persisted BEFORE the caller sees the transition.
    await this.store.write(state)
    return { ok: true, done: step.nextStep === undefined }
  }

  private reopen(state: TaskState, stepId: string): void {
    const index = this.workflow.order.indexOf(stepId)
    if (index < 0) throw new Error(`unknown step: ${stepId}`)

    for (const later of this.workflow.order.slice(index)) {
      const record = state.steps[later]
      if (record) state.steps[later] = { ...record, status: 'pending' }
    }
    state.currentStepId = stepId
  }

  private stepById(id: string): StepDef {
    const step = this.workflow.steps[id]
    if (!step) throw new Error(`unknown step: ${id}`)
    return step
  }

  private taskFor(step: StepDef): TaskType {
    return this.registry.get(step.taskType)
  }

  private previousId(fromId: string): string | undefined {
    const index = this.workflow.order.indexOf(fromId)
    return index > 0 ? this.workflow.order[index - 1] : undefined
  }
}
