import { describe, it, expect } from 'vitest'
import { CollectRequirement } from '../../src/tasks/CollectRequirement'
import { ProviderRegistry, type Provider } from '../../src/providers/Provider'
import { context, step } from '../support/fixtures'

const requirement = step('requirement')
const ctx = context()

describe('CollectRequirement', () => {
  const task = new CollectRequirement()

  it('is a task step, matching the workflow it is named by', () => {
    expect(task.name).toBe('CollectRequirement')
    expect(task.stepType).toBe('task')
  })

  it('offers the same fields to every workflow that names it', async () => {
    expect((await task.describe(requirement, ctx, {})).fields!.map((f) => f.id)).toEqual([
      'story',
      'notes',
    ])
  })

  it('names the notes field for where the notes actually come from', async () => {
    const notes = (await task.describe(requirement, ctx, {})).fields!.find((f) => f.id === 'notes')
    expect(notes!.label).toBe('Meeting notes from call or conversation')
  })

  it('routes the JIRA story through a provider, which is the MCP seam', async () => {
    const story = (await task.describe(requirement, ctx, {})).fields!.find((f) => f.id === 'story')
    expect(story!.provider).toBe('manual')
  })

  it('offers Back and Continue actions', async () => {
    expect((await task.describe(requirement, ctx, {})).actions.map((a) => a.id)).toEqual(['back', 'submit'])
  })

  it('fails validation when the story is empty', () => {
    const r = task.validate(requirement, { story: '' })
    expect(r.ok).toBe(false)
    expect(r.errors.story).toMatch(/required/i)
  })

  it('treats whitespace as empty', () => {
    expect(task.validate(requirement, { story: '   ' }).ok).toBe(false)
  })

  it('does not require the notes, which are often not written down anywhere', () => {
    expect(task.validate(requirement, { story: 'As a customer I can pay' }).ok).toBe(true)
  })

  it('returns the submitted values from execute', async () => {
    const values = { story: 'PLAT-1 body', notes: 'from refinement' }
    expect(await task.execute(requirement, ctx, values)).toEqual(values)
  })
})

/**
 * The seam D5 promised, exercised. Until P3 there is one provider and it offers
 * no choices, so the field renders as it always did — but the resolution path is
 * live, which is what stops P3 being planned as "implement a provider" when it
 * is really "build the seam, then implement a provider". See spec Section 5.
 */
describe('a field resolves its provider', () => {
  const requirement = step('requirement', { stepType: 'task', taskType: 'CollectRequirement' })
  const ctx = context({ order: ['requirement'] })

  function registryOf(provider: Provider): ProviderRegistry {
    return new ProviderRegistry([provider])
  }

  it('asks the provider the field names, by name', async () => {
    const asked: string[] = []
    const spy: Provider = {
      name: 'manual',
      async options(field) {
        asked.push(field.id)
        return undefined
      },
    }

    await new CollectRequirement(registryOf(spy)).describe(requirement, ctx, {})
    // The story field names a provider; the notes field does not.
    expect(asked).toEqual(['story'])
  })

  it('leaves the field as authored when the provider offers no choices', async () => {
    const view = await new CollectRequirement().describe(requirement, ctx, {})
    const story = view.fields!.find((f) => f.id === 'story')!
    expect(story.type).toBe('textarea')
    expect(story.options).toBeUndefined()
  })

  // The migration in one test: a provider that returns options turns free entry
  // into a selection, and nothing else in the tool changes.
  it('turns the field into a selection when the provider offers choices', async () => {
    const jira: Provider = {
      name: 'manual',
      async options() {
        return [
          { value: 'PLAT-1', label: 'PLAT-1 Checkout is slow' },
          { value: 'PLAT-2', label: 'PLAT-2 Promo codes double' },
        ]
      },
    }

    const view = await new CollectRequirement(registryOf(jira)).describe(requirement, ctx, {})
    const story = view.fields!.find((f) => f.id === 'story')!
    expect(story.type).toBe('select')
    expect(story.options).toHaveLength(2)
  })

  it('leaves a field with no provider alone entirely', async () => {
    const view = await new CollectRequirement().describe(requirement, ctx, {})
    expect(view.fields!.find((f) => f.id === 'notes')!.type).toBe('textarea')
  })

  it('names the providers it knows when a field asks for one that is missing', async () => {
    const empty = new ProviderRegistry([])
    await expect(new CollectRequirement(empty).describe(requirement, ctx, {})).rejects.toThrow(
      /unknown provider "manual"/,
    )
  })
})
