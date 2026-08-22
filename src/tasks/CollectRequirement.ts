import type { FieldDef, StepDef } from '../engine/schema'
import { defaultProviders } from '../providers/registry'
import type { ProviderRegistry } from '../providers/Provider'
import type { Answers, RenderField, StepContext, ValidationResult } from './context'
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
 *
 * Its story field names a provider, and that name is now actually resolved —
 * see `describe`. Until P3 the only provider is `ManualProvider`, which offers
 * no choices, so the field renders exactly as it always did. What changed is
 * that the path is live rather than notional: spec D5 had recorded the seam as
 * "a design intention with a placeholder", which risked P3 being planned as
 * implementing a provider when it was really building the seam first.
 */
export class CollectRequirement implements TaskType {
  readonly name = 'CollectRequirement'
  readonly stepType = 'task' as const
  readonly title = 'Collect the requirement'
  readonly transitions = ['submit'] as const

  private readonly fields: FieldDef[] = [
    {
      id: 'story',
      type: 'textarea',
      label: 'JIRA story acceptance criteria as is',
      provider: 'manual',
      required: true,
    },
    { id: 'notes', type: 'textarea', label: 'Meeting notes from call or conversation' },
  ]

  constructor(private readonly providers: ProviderRegistry = defaultProviders()) {}

  async describe(_step: StepDef, _ctx: StepContext, _values: Answers): Promise<TaskView> {
    return {
      fields: await Promise.all(this.fields.map((field) => this.offer(field))),
      actions: [
        { id: 'back', label: 'Back' },
        { id: 'submit', label: 'Continue', primary: true },
      ],
    }
  }

  /**
   * A field's provider decides whether it is free entry or a choice.
   *
   * `ManualProvider` returns nothing, so a manual field stays as authored. A
   * provider that *does* return options — a JIRA one listing the stories on an
   * epic — turns the same field into a selection, which is the migration D5
   * describes: a new provider, a new name in the field, and no other change.
   */
  private async offer(field: FieldDef): Promise<RenderField> {
    if (!field.provider) return field

    const options = await this.providers.get(field.provider).options(field)
    return options ? { ...field, type: 'select', options } : field
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
