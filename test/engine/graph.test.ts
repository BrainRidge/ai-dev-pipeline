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
      prompts: [],
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

/**
 * A step's `prompts` are validated when the catalogue loads, so a typo in a
 * workflow fails on a tool developer's machine rather than three steps into
 * somebody's task. Existence cannot be checked here — the file may live in a
 * team's content folder, which the catalogue knows nothing about — so this is
 * the shape only. See spec Section 6.
 */
describe('prompt names in a workflow', () => {
  const withPrompts = (prompts: string[]): Record<string, StepDef> => ({
    a: {
      id: 'a',
      stepType: 'aiHandoff',
      taskType: 'invokeCopilot',
      documentation: '',
      prompts,
    },
  })

  it('accepts a rooted markdown name, which is how one is written', () => {
    expect(() => validateGraph('wf', 'a', withPrompts(['/skills/java-expert.md']))).not.toThrow()
  })

  it('accepts one without the leading slash too', () => {
    expect(() => validateGraph('wf', 'a', withPrompts(['skills/java.md']))).not.toThrow()
  })

  it('accepts a step with none', () => {
    expect(() => validateGraph('wf', 'a', withPrompts([]))).not.toThrow()
  })

  it('refuses something that is not markdown, since prompts are markdown', () => {
    expect(() => validateGraph('wf', 'a', withPrompts(['/skills/java.txt']))).toThrow(
      /must end in \.md/,
    )
  })

  it('refuses a name that climbs out of the prompts folder', () => {
    expect(() => validateGraph('wf', 'a', withPrompts(['../../secrets.md']))).toThrow(
      /climbs out of the prompts folder/,
    )
  })

  it('refuses a Windows absolute path', () => {
    expect(() => validateGraph('wf', 'a', withPrompts(['C:\\skills\\java.md']))).toThrow(
      /absolute path/,
    )
  })

  it('refuses a name that is only a slash', () => {
    expect(() => validateGraph('wf', 'a', withPrompts(['/']))).toThrow(/names no file/)
  })

  it('names the workflow and the step, so the error says where to look', () => {
    expect(() => validateGraph('myWorkflow', 'a', withPrompts(['/bad.txt']))).toThrow(
      /myWorkflow: step "a" lists prompt "\/bad\.txt"/,
    )
  })
})

describe('the prompt a step names', () => {
  const withPrompt = (prompt: string): Record<string, StepDef> => ({
    a: {
      id: 'a',
      stepType: 'aiHandoff',
      taskType: 'invokeCopilot',
      documentation: '',
      prompt,
      prompts: [],
    },
  })

  it('accepts the path a workflow author writes', () => {
    expect(() =>
      validateGraph('wf', 'a', withPrompt('/prompts/bugFixWorkflow/diagnosis.md')),
    ).not.toThrow()
  })

  it('refuses one that is not markdown', () => {
    expect(() => validateGraph('wf', 'a', withPrompt('/prompts/w/a.txt'))).toThrow(/\.md/)
  })

  it('refuses one that climbs out of the prompts folder', () => {
    expect(() => validateGraph('wf', 'a', withPrompt('../../secrets.md'))).toThrow(/climbs out/)
  })

  it('names the workflow and step, so the error says where to look', () => {
    expect(() => validateGraph('myWorkflow', 'a', withPrompt('/bad.txt'))).toThrow(
      /myWorkflow: step "a" names prompt "\/bad\.txt"/,
    )
  })
})
