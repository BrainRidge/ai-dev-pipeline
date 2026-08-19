import { describe, it, expect } from 'vitest'
import { resolveValue, resolveText, resolveList } from '../../src/engine/placeholders'
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
