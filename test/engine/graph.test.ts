import { describe, it, expect } from 'vitest'
import { validateGraph } from '../../src/engine/WorkflowCatalog'
import { parseWorkflowFilename, type StepDef } from '../../src/engine/schema'

function steps(spec: Record<string, string | undefined>): Record<string, StepDef> {
  const out: Record<string, StepDef> = {}
  for (const [id, nextStep] of Object.entries(spec)) {
    out[id] = {
      id,
      stepType: 'task',
      taskType: 'CollectRequirement',
      documentation: '',
      ...(nextStep ? { nextStep } : {}),
    }
  }
  return out
}

describe('parseWorkflowFilename', () => {
  it('reads id and version from the filename', () => {
    expect(parseWorkflowFilename('researchTaskWorkflow_1_0.json')).toEqual({
      id: 'researchTaskWorkflow',
      version: '1.0',
    })
  })

  it('handles multi-digit versions', () => {
    expect(parseWorkflowFilename('bugFix_12_34.json')).toEqual({ id: 'bugFix', version: '12.34' })
  })

  it('rejects an unversioned filename', () => {
    expect(parseWorkflowFilename('research.json')).toBeUndefined()
  })
})

describe('validateGraph', () => {
  it('returns reachable order from the entry point', () => {
    const order = validateGraph('wf', 'a', steps({ a: 'b', b: 'c', c: undefined }))
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('rejects an initialStep that is not a step', () => {
    expect(() => validateGraph('wf', 'nope', steps({ a: undefined }))).toThrow(/initialStep/)
  })

  it('rejects a nextStep that does not resolve', () => {
    expect(() => validateGraph('wf', 'a', steps({ a: 'ghost' }))).toThrow(/unknown nextStep "ghost"/)
  })

  // The typo in the original example JSON.
  it('rejects a step that points at itself', () => {
    expect(() => validateGraph('wf', 'a', steps({ a: 'b', b: 'b' }))).toThrow(/points at itself/)
  })

  it('rejects a stranded step', () => {
    expect(() => validateGraph('wf', 'a', steps({ a: undefined, orphan: undefined }))).toThrow(
      /"orphan" cannot be reached/,
    )
  })

  it('rejects a graph with no terminal step', () => {
    // a -> b -> a: every step is reachable, but it never ends.
    expect(() => validateGraph('wf', 'a', steps({ a: 'b', b: 'a' }))).toThrow(/never finish/)
  })

  it('accepts a loop that still has a way out', () => {
    // a -> b -> c, and c is terminal; b is revisitable via an explicit action.
    expect(validateGraph('wf', 'a', steps({ a: 'b', b: 'c', c: undefined }))).toHaveLength(3)
  })
})
