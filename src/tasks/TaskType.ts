import type { StepDef, StepType } from '../engine/schema'
import type {
  ActionDef,
  Answers,
  CommandBlock,
  RenderField,
  StepContext,
  ValidationResult,
} from './context'

export interface TaskView {
  fields?: RenderField[]
  text?: string
  /** Commands for the developer to run themselves. See spec Section 9. */
  commands?: CommandBlock[]
  actions: ActionDef[]
}

/**
 * A taskType is one of the platform's primitives. Workflows are configuration
 * that compose these by name; the vocabulary itself is code, because each
 * primitive has real behaviour behind it.
 *
 * Adding a step to a workflow  -> configuration.
 * Adding a new kind of primitive -> a class here.
 *
 * See spec Section 5.
 */
export interface TaskType {
  /** Referenced by `taskType` in workflow JSON. */
  readonly name: string
  /** Cross-checked against the `stepType` declared in the JSON. */
  readonly stepType: StepType
  /**
   * What the developer sees on the step. It belongs to the primitive rather
   * than the workflow, so every workflow naming this taskType names it the
   * same way — which is the point of standardising the process.
   */
  readonly title: string
  describe(step: StepDef, ctx: StepContext, values: Answers): Promise<TaskView>
  validate(step: StepDef, values: Answers): ValidationResult
  execute(step: StepDef, ctx: StepContext, values: Answers): Promise<Record<string, unknown>>
}

export class TaskTypeRegistry {
  private readonly types = new Map<string, TaskType>()

  constructor(types: TaskType[] = []) {
    for (const t of types) this.register(t)
  }

  register(t: TaskType): void {
    this.types.set(t.name, t)
  }

  get(name: string): TaskType {
    const t = this.types.get(name)
    if (!t) {
      throw new Error(
        `unknown taskType "${name}". Known: ${[...this.types.keys()].sort().join(', ')}`,
      )
    }
    return t
  }

  has(name: string): boolean {
    return this.types.has(name)
  }

  /** Every taskType named by a workflow must exist and agree on its stepType. */
  validateWorkflow(workflowId: string, steps: Record<string, StepDef>): void {
    for (const step of Object.values(steps)) {
      const t = this.get(step.taskType)
      if (t.stepType !== step.stepType) {
        throw new Error(
          `${workflowId}: step "${step.id}" declares stepType "${step.stepType}" ` +
            `but taskType "${step.taskType}" is a "${t.stepType}" step`,
        )
      }
    }
  }
}
