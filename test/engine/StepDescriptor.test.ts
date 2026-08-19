import { describe, it, expect } from 'vitest'
import {
  buildWorkflowDescriptor,
  badgeFor,
  summarise,
  PROTOCOL_VERSION,
} from '../../src/engine/StepDescriptor'
import { buildWorkflow } from '../../src/engine/WorkflowCatalog'
import { CollectRequirement } from '../../src/tasks/CollectRequirement'
import { GitClone } from '../../src/tasks/GitClone'
import { ManualReview } from '../../src/tasks/ManualReview'
import { TaskTypeRegistry } from '../../src/tasks/TaskType'
import type { CommandSink } from '../../src/tasks/CommandSink'
import { context, step, taskState } from '../support/fixtures'

const noSink: CommandSink = { async copy() {}, async toTerminal() {} }

const workflow = buildWorkflow('researchTaskWorkflow', '1.0', {
  schemaVersion: 1,
  label: 'Research Task',
  initialStep: 'requirement',
  steps: {
    requirement: {
      stepType: 'task',
      taskType: 'CollectRequirement',
      documentation: 'Describe what you need to find out.',
      nextStep: 'gitClone',
    },
    gitClone: {
      stepType: 'commandExecution',
      taskType: 'gitClone',
      documentation: 'Clones the microservices you selected.',
      nextStep: 'reviewAnalysis',
    },
    reviewAnalysis: { stepType: 'manual', taskType: 'manualReview', documentation: '' },
  },
})

const registry = new TaskTypeRegistry([
  new CollectRequirement(),
  new GitClone('/code', () => false, noSink),
  new ManualReview(async () => {}, async () => 'h'),
])

const state = taskState({
  currentStepId: 'gitClone',
  steps: {
    requirement: { status: 'complete', answers: { story: 'why is checkout slow' } },
  },
})

const ctx = context({ order: workflow.order, inputs: { services: ['pis'], baseBranch: 'develop', workDir: '/Users/you/work' } })

function build(values = {}, errors = {}) {
  return buildWorkflowDescriptor({ workflow, state, registry, ctx, values, errors })
}

describe('buildWorkflowDescriptor', () => {
  it('stamps protocol version 2', async () => {
    expect((await build()).protocolVersion).toBe(PROTOCOL_VERSION)
    expect(PROTOCOL_VERSION).toBe(2)
  })

  it('returns every step in nextStep order, so the whole journey is visible', async () => {
    expect((await build()).steps.map((s) => s.id)).toEqual(['requirement', 'gitClone', 'reviewAnalysis'])
  })

  it('numbers steps from one', async () => {
    expect((await build()).steps.map((s) => s.index)).toEqual([1, 2, 3])
  })

  it('titles each step from its taskType, never from the workflow JSON', async () => {
    expect((await build()).steps.map((s) => s.title)).toEqual([
      'Collect the requirement',
      'Get the code',
      'Review the result',
    ])
  })

  it('carries the workflow author’s documentation through to the developer', async () => {
    expect((await build()).steps[0]!.documentation).toBe('Describe what you need to find out.')
  })

  it('marks status across the workflow', async () => {
    expect((await build()).steps.map((s) => s.status)).toEqual(['complete', 'current', 'pending'])
  })

  it('names the active step', async () => {
    expect((await build()).activeStepId).toBe('gitClone')
  })

  it('gives fields only to the active step', async () => {
    const [requirement, gitClone, review] = (await build()).steps
    expect(requirement!.fields).toBeUndefined()
    expect(gitClone!.fields).toBeUndefined()
    expect(review!.fields).toBeUndefined()
  })

  it('gives the active step its fields when it has any', async () => {
    const onRequirement = await buildWorkflowDescriptor({
      workflow,
      state: taskState({ currentStepId: 'requirement' }),
      registry,
      ctx,
      values: {},
      errors: {},
    })
    expect(onRequirement.steps[0]!.fields).toHaveLength(2)
  })

  it('summarises a completed step from its answers', async () => {
    expect((await build()).steps[0]!.summary).toBe('why is checkout slow')
  })

  it('shows a completed step’s answers read-only', async () => {
    expect((await build()).steps[0]!.answers).toEqual([
      { label: 'JIRA story acceptance criteria as is', value: 'why is checkout slow' },
    ])
  })

  it('offers Edit on completed steps only', async () => {
    const [requirement, , review] = (await build()).steps
    expect(requirement!.actions?.map((a) => a.id)).toEqual(['edit'])
    expect(review!.actions).toBeUndefined()
  })

  it('gives the active step the actions its taskType declares', async () => {
    expect((await build()).steps[1]!.actions?.map((a) => a.id)).toEqual(['back', 'submit'])
  })

  it('carries the planned commands on the active command step', async () => {
    expect((await build()).steps[1]!.commands?.map((c) => c.id)).toEqual(['pis'])
  })

  it('gives commands only to the active step', async () => {
    expect((await build()).steps[0]!.commands).toBeUndefined()
    expect((await build()).steps[2]!.commands).toBeUndefined()
  })

  it('prefills the active step from stored answers when re-editing', async () => {
    const editing = await buildWorkflowDescriptor({
      workflow,
      state: taskState({ ...state, currentStepId: 'requirement' }),
      registry,
      ctx,
      values: {},
      errors: {},
    })
    expect(editing.steps[0]!.values).toEqual({ story: 'why is checkout slow' })
  })

  it('carries task identity for the header', async () => {
    expect((await build()).task).toEqual({
      id: 'T-1',
      platform: 'canada-assisted',
      epic: 'PLAT-1234',
      workflowLabel: 'Research Task',
    })
  })

  it('surfaces errors on the active step', async () => {
    expect((await build({}, { question: 'required' })).steps[1]!.errors).toEqual({ question: 'required' })
  })
})

describe('badgeFor', () => {
  it('labels a text form INPUT', () => {
    expect(badgeFor(step('a'), [{ id: 'q', type: 'textarea', label: 'Q' }])).toBe('INPUT')
  })

  it('labels a choice form SELECT', () => {
    expect(badgeFor(step('a'), [{ id: 's', type: 'multiselect', label: 'S' }])).toBe('SELECT')
  })

  it('labels the other stepTypes by stepType', () => {
    expect(badgeFor(step('a', { stepType: 'commandExecution' }), undefined)).toBe('COMMAND')
    expect(badgeFor(step('a', { stepType: 'aiHandoff' }), undefined)).toBe('COPILOT')
    expect(badgeFor(step('a', { stepType: 'manual' }), undefined)).toBe('REVIEW')
  })
})

describe('summarise', () => {
  const git = step('gitClone', { stepType: 'commandExecution' })

  it('reports repos and branch for a command step', () => {
    const s = summarise(
      git,
      {
        status: 'complete',
        result: { repos: [{ name: 'pis' }, { name: 'ords' }], branch: 'develop' },
      },
      undefined,
    )
    expect(s).toBe('2 repos on develop')
  })

  it('reads naturally for a single repository', () => {
    const s = summarise(
      git,
      { status: 'complete', result: { repos: [{ name: 'pis' }], branch: 'develop' } },
      undefined,
    )
    expect(s).toBe('1 repo on develop')
  })

  it('reports whether the handoff output arrived, by filename', () => {
    const handoff = step('aiHandoff', { stepType: 'aiHandoff' })
    const result = { outputPath: '/tasks/T-1/02-analysis.md' }
    expect(summarise(handoff, { status: 'complete', result: { ...result, outputPresent: true } }, undefined))
      .toBe('02-analysis.md written')
    expect(summarise(handoff, { status: 'complete', result: { ...result, outputPresent: false } }, undefined))
      .toBe('02-analysis.md missing')
  })

  it('names the approved artifact for a manual step', () => {
    const review = step('reviewAnalysis', { stepType: 'manual' })
    const s = summarise(
      review,
      { status: 'complete', result: { artifactPath: '/tasks/T-1/02-analysis.md' } },
      undefined,
    )
    expect(s).toBe('02-analysis.md approved')
  })

  it('returns nothing for an incomplete step', () => {
    expect(summarise(step('a'), { status: 'pending' }, undefined)).toBeUndefined()
  })

  it('truncates a long answer', () => {
    const s = summarise(
      step('a'),
      { status: 'complete', answers: { q: 'x'.repeat(200) } },
      [{ id: 'q', type: 'textarea', label: 'Q' }],
    )
    expect(s!.length).toBeLessThanOrEqual(118)
    expect(s!.endsWith('…')).toBe(true)
  })
})
