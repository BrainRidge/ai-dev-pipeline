import { describe, it, expect } from 'vitest'
import { parseExtracted } from '../../src/browser/JiraExtractor'

describe('parseExtracted', () => {
  it('passes through a well-formed result', () => {
    expect(parseExtracted({ title: 'T', description: 'D', acceptanceCriteria: 'AC' })).toEqual({
      title: 'T',
      description: 'D',
      acceptanceCriteria: 'AC',
    })
  })

  it('reads a missing field as empty rather than throwing', () => {
    expect(parseExtracted({ title: 'T' })).toEqual({
      title: 'T',
      description: '',
      acceptanceCriteria: '',
    })
  })

  it('reads a field of the wrong type as empty', () => {
    expect(parseExtracted({ title: 42 })).toEqual({
      title: '',
      description: '',
      acceptanceCriteria: '',
    })
  })

  it('reads a wholly unexpected shape as all-empty', () => {
    expect(parseExtracted(null)).toEqual({ title: '', description: '', acceptanceCriteria: '' })
    expect(parseExtracted(undefined)).toEqual({ title: '', description: '', acceptanceCriteria: '' })
    expect(parseExtracted('unexpected')).toEqual({ title: '', description: '', acceptanceCriteria: '' })
  })
})
