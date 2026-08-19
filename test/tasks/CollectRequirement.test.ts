import { describe, it, expect } from 'vitest'
import { CollectRequirement } from '../../src/tasks/CollectRequirement'
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
