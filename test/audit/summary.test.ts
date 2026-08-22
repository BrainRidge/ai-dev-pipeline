import { describe, it, expect } from 'vitest'
import { report, summarise } from '../../src/audit/summary'
import type { AuditEntry } from '../../src/audit/AuditLog'

const delivered = (mechanism: string): AuditEntry => ({
  kind: 'prompt-delivered',
  stepId: 'aiHandoff',
  data: { mechanism, chars: 100 },
})

const composed = (over: Record<string, unknown> = {}): AuditEntry => ({
  kind: 'prompt-composed',
  stepId: 'aiHandoff',
  data: { templateSource: 'bundled', unresolved: [], ...over },
})

/**
 * V1 in spec Section 12 asks which rung of the handoff ladder works in practice.
 * The logs have always held the answer; nothing read them, and until the
 * prompt-delivered entry existed the mechanism was not in the log at all.
 */
describe('summarising the session logs', () => {
  it('counts each mechanism, across tasks', () => {
    const s = summarise([
      [delivered('A'), delivered('A')],
      [delivered('B'), delivered('C'), delivered('A')],
    ])
    expect(s.tasks).toBe(2)
    expect(s.handoffs).toBe(5)
    expect(s.byMechanism).toEqual({ A: 3, B: 1, C: 1 })
  })

  it('ignores a mechanism it does not recognise rather than inventing a bucket', () => {
    const s = summarise([[delivered('Z')]])
    expect(s.handoffs).toBe(1)
    expect(s.byMechanism).toEqual({ A: 0, B: 0, C: 0 })
  })

  it('separates prompts composed from a team template from the bundled default', () => {
    const s = summarise([
      [composed({ templateSource: 'external' }), composed({ templateSource: 'bundled' })],
    ])
    expect(s.templates).toEqual({ external: 1, bundled: 1 })
  })

  // The most actionable thing in the report: each of these is a misspelling in
  // a template that sent a prompt with a blank in it.
  it('tallies unresolved placeholders by name, commonest first in the report', () => {
    const s = summarise([
      [composed({ unresolved: ['requirement.stroy'] }), composed({ unresolved: ['requirement.stroy', 'task.nope'] })],
    ])
    expect(s.unresolved).toEqual({ 'requirement.stroy': 2, 'task.nope': 1 })
  })

  it('counts artifacts seen to appear, sample-catalogue tasks and edited snapshots', () => {
    const s = summarise([
      [
        { kind: 'output-detected', stepId: 'aiHandoff' },
        { kind: 'content-resolved', data: { source: 'sample' } },
        { kind: 'snapshot-modified', data: {} },
      ],
    ])
    expect(s.outputsDetected).toBe(1)
    expect(s.sampleCatalogue).toBe(1)
    expect(s.snapshotsModified).toBe(1)
  })

  it('is untroubled by a log with nothing in it', () => {
    expect(summarise([[]]).handoffs).toBe(0)
  })

  it('is untroubled by entries carrying no data at all', () => {
    expect(() => summarise([[{ kind: 'prompt-delivered' }]])).not.toThrow()
  })
})

describe('the report a person reads', () => {
  it('says plainly when mechanism A has never failed', () => {
    const text = report(summarise([[delivered('A'), delivered('A')]]))
    expect(text).toContain('Mechanism A has never failed on this machine')
    // And does not overclaim: agent mode is a separate, still-unanswered question.
    expect(text).toContain('does **not** tell you whether')
  })

  it('says plainly when mechanism A has never worked', () => {
    const text = report(summarise([[delivered('B'), delivered('C')]]))
    expect(text).toContain('Mechanism A has never succeeded here')
  })

  it('reports a mixed result as the least convenient answer', () => {
    const text = report(summarise([[delivered('A'), delivered('B')]]))
    expect(text).toContain('neither')
    expect(text).toContain('50%')
  })

  it('draws no conclusion from no data', () => {
    const text = report(summarise([]))
    expect(text).toContain('nothing to conclude')
    expect(text).not.toContain('never failed')
  })

  it('lists misspelt placeholders, since each one sent a prompt with a hole in it', () => {
    const text = report(summarise([[composed({ unresolved: ['requirement.stroy'] })]]))
    expect(text).toContain('{{requirement.stroy}}')
    expect(text).toContain('1 time(s)')
  })

  it('leaves out the sections it has nothing to say about', () => {
    const text = report(summarise([[delivered('A')]]))
    expect(text).not.toContain('Placeholders that resolved to nothing')
    expect(text).not.toContain('Workflow snapshots edited')
    expect(text).not.toContain('bundled sample')
  })

  it('mentions a task that ran on the sample catalogue', () => {
    const text = report(summarise([[{ kind: 'content-resolved', data: { source: 'sample' } }]]))
    expect(text).toContain('no microservice catalogue configured')
  })
})
