import type { StepDef } from '../engine/schema'
import type { Answers, StepContext, ValidationResult } from './context'
import type { TaskType, TaskView } from './TaskType'

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

/**
 * Gathers the human context a task needs. Defined once and referenced by the
 * research, story-development and bug-fix workflows alike.
 */
export class CollectRequirement implements TaskType {
  readonly name = 'CollectRequirement'
  readonly stepType = 'task' as const
  readonly title = 'Collect the requirement'

  private readonly fields = [
    { id: 'story', type: 'textarea' as const, label: 'JIRA story acceptance criteria as is', provider: 'manual' , required: true},
    { id: 'notes', type: 'textarea' as const, label: 'Meeting notes from call or conversation' },
  ]

  async describe(_step: StepDef, _ctx: StepContext, _values: Answers): Promise<TaskView> {
    return {
      fields: this.fields,
      actions: [
        { id: 'back', label: 'Back' },
        { id: 'submit', label: 'Continue', primary: true },
      ],
    }
  }

  validate(_step: StepDef, values: Answers): ValidationResult {
    const errors: Record<string, string> = {}
    for (const f of this.fields) {
      if (f.required && isEmpty(values[f.id])) errors[f.id] = `${f.label} is required`
    }
    return { ok: Object.keys(errors).length === 0, errors }
  }

  async execute(
    _step: StepDef,
    _ctx: StepContext,
    values: Answers,
  ): Promise<Record<string, unknown>> {
    return values
  }
}
