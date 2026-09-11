import { describe, it, expect } from 'vitest'
import {
  microservicesFileSchema,
  platformsFileSchema,
  workflowFileSchema,
} from '../../src/engine/schema'

const minimal = {
  schemaVersion: 1,
  label: 'Research Task',
  initialStep: 'requirement',
  steps: {
    requirement: {
      stepType: 'task',
      taskType: 'CollectRequirement',
      documentation: 'Describe what you need to find out.', prompts: [] },
  },
}

describe('workflowFileSchema', () => {
  it('accepts a minimal valid workflow', () => {
    expect(workflowFileSchema.parse(minimal).steps.requirement!.taskType).toBe('CollectRequirement')
  })

  it('defaults documentation to empty rather than failing the load', () => {
    const parsed = workflowFileSchema.parse({
      ...minimal,
      steps: { requirement: { stepType: 'task', taskType: 'CollectRequirement' } },
    })
    expect(parsed.steps.requirement!.documentation).toBe('')
  })

  it('rejects an unknown stepType', () => {
    expect(() =>
      workflowFileSchema.parse({
        ...minimal,
        steps: { requirement: { stepType: 'teleport', taskType: 'X' } },
      }),
    ).toThrow()
  })

  it('rejects a step with no taskType, since there would be nothing to run', () => {
    expect(() =>
      workflowFileSchema.parse({ ...minimal, steps: { requirement: { stepType: 'task' } } }),
    ).toThrow()
  })

  it('rejects a schemaVersion it does not understand', () => {
    expect(() => workflowFileSchema.parse({ ...minimal, schemaVersion: 2 })).toThrow()
  })

  it('rejects a workflow with no entry point', () => {
    const { initialStep: _initialStep, ...rest } = minimal
    expect(() => workflowFileSchema.parse(rest)).toThrow()
  })
})

describe('microservicesFileSchema', () => {
  const service = {
    microserviceName: 'Payment Service',
    shortCode: 'pis',
    gitLocation: 'https://abc.github/payment-service.ui',
  }

  it('accepts a service with only its required facts', () => {
    const [parsed] = microservicesFileSchema.parse([service])
    expect(parsed!.purpose).toBe('')
    expect(parsed!.category).toBe('')
  })

  it('requires a git location, because a service that cannot be cloned is useless', () => {
    const { gitLocation: _gitLocation, ...rest } = service
    expect(() => microservicesFileSchema.parse([rest])).toThrow()
  })

  it('requires a shortCode, because it is what the sidebar selects by', () => {
    const { shortCode: _shortCode, ...rest } = service
    expect(() => microservicesFileSchema.parse([rest])).toThrow()
  })
})

describe('platformsFileSchema', () => {
  it('accepts platforms as id and label only — platform is context, not a filter', () => {
    const parsed = platformsFileSchema.parse({
      platforms: [{ id: 'canada-assisted', label: 'Canada Assisted' }],
    })
    expect(parsed.platforms).toHaveLength(1)
  })

  it('rejects a platform with no label', () => {
    expect(() => platformsFileSchema.parse({ platforms: [{ id: 'x' }] })).toThrow()
  })
})
