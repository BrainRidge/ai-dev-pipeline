import { describe, it, expect } from 'vitest'
import { resolveValue, resolveText, resolveList, unresolvedIn } from '../../src/engine/placeholders'
import { context } from '../support/fixtures'

const ctx = context({
  inputs: { services: ['payments', 'orders'], taskType: 'research' },
  answersOf: (id) => (id === 'scope' ? { question: 'why slow' } : {}),
})

describe('resolveValue', () => {
  it('resolves built-in task fields', () => {
    expect(resolveValue('task', 'platform', ctx)).toBe('canada-assisted')
    expect(resolveValue('task', 'epic', ctx)).toBe('PLAT-1234')
    expect(resolveValue('task', 'dir', ctx)).toBe('/tasks/T-1')
    expect(resolveValue('task', 'id', ctx)).toBe('T-1')
  })

  it('resolves sidebar-collected task inputs', () => {
    expect(resolveValue('task', 'services', ctx)).toEqual(['payments', 'orders'])
  })

  it('resolves step answers', () => {
    expect(resolveValue('scope', 'question', ctx)).toBe('why slow')
  })

  it('returns undefined for an unknown input', () => {
    expect(resolveValue('task', 'nope', ctx)).toBeUndefined()
  })
})

describe('resolveText', () => {
  it('substitutes into surrounding text', () => {
    expect(resolveText('Branch {{task.epic}}-research', ctx)).toBe('Branch PLAT-1234-research')
  })

  it('renders an array as a readable list', () => {
    expect(resolveText('Services: {{task.services}}', ctx)).toBe('Services: payments, orders')
  })

  it('renders a missing value as empty, never "undefined"', () => {
    expect(resolveText('X={{task.nope}}', ctx)).toBe('X=')
  })
})

describe('resolveList', () => {
  it('returns the raw array for a lone placeholder', () => {
    expect(resolveList('{{task.services}}', ctx)).toEqual(['payments', 'orders'])
  })

  it('returns empty for a non-array value', () => {
    expect(resolveList('{{task.epic}}', ctx)).toEqual([])
  })

  it('returns empty for text that is not a lone placeholder', () => {
    expect(resolveList('a {{task.services}} b', ctx)).toEqual([])
  })
})

/**
 * `resolveText` renders anything it cannot resolve as nothing, so a typo used to
 * produce a quietly incomplete prompt that only a test asserting the composed
 * text would catch. Spec Section 8 called that a known regret; this is it being
 * caught. See spec Section 8.
 */
describe('finding placeholders that name nothing', () => {
  const ctx = context({
    inputs: { services: ['pis'], baseBranch: 'develop' },
    order: ['requirement', 'gitClone', 'aiHandoff'],
    answersOf: (id) => (id === 'requirement' ? { story: 'why', notes: '' } : {}),
  })

  it('says nothing about a template that resolves cleanly', () => {
    expect(
      unresolvedIn('{{task.platform}} {{task.baseBranch}} {{requirement.story}}', ctx),
    ).toEqual([])
  })

  it('catches a misspelled namespace', () => {
    expect(unresolvedIn('{{requirment.story}}', ctx)).toEqual(['requirment.story'])
  })

  it('catches a namespace that is not a step in this workflow', () => {
    expect(unresolvedIn('{{diagnosis.cause}}', ctx)).toEqual(['diagnosis.cause'])
  })

  it('catches a misspelled task input', () => {
    expect(unresolvedIn('{{task.baseBrunch}}', ctx)).toEqual(['task.baseBrunch'])
  })

  it('accepts the task fields that come from somewhere other than inputs', () => {
    expect(unresolvedIn('{{task.platform}} {{task.epic}} {{task.dir}} {{task.id}}', ctx)).toEqual(
      [],
    )
  })

  // A step that answered carries every field it declared, including the blank
  // ones, so a key that is absent is a misspelling rather than a blank answer.
  it('catches a misspelled field on a step that has answered', () => {
    expect(unresolvedIn('{{requirement.stroy}}', ctx)).toEqual(['requirement.stroy'])
  })

  it('does not mistake a field answered blank for a missing one', () => {
    expect(unresolvedIn('{{requirement.notes}}', ctx)).toEqual([])
  })

  /**
   * The false positive that matters. The descriptor composes every handoff on
   * every render, including while an earlier step is still being filled in, so
   * flagging this would put a warning on a correct template for as long as the
   * developer was typing.
   */
  it('says nothing about a step that has not answered yet', () => {
    expect(unresolvedIn('{{gitClone.anything}}', ctx)).toEqual([])
  })

  it('reports each distinct placeholder once, however often it appears', () => {
    expect(unresolvedIn('{{a.b}} {{a.b}} {{a.b}}', ctx)).toEqual(['a.b'])
  })

  it('reports several problems together, so one fix per read', () => {
    expect(unresolvedIn('{{a.b}} {{task.nope}}', ctx).sort()).toEqual(['a.b', 'task.nope'])
  })

  it('is untroubled by text with no placeholders at all', () => {
    expect(unresolvedIn('Just prose, and a { brace } or two.', ctx)).toEqual([])
  })
})
