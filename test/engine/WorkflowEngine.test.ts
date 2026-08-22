import { describe, it, expect } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkflowEngine } from '../../src/engine/WorkflowEngine'
import { buildWorkflow } from '../../src/engine/WorkflowCatalog'
import { TaskStateStore } from '../../src/state/TaskStateStore'
import { CollectRequirement } from '../../src/tasks/CollectRequirement'
import { TaskTypeRegistry } from '../../src/tasks/TaskType'
import type { TaskType } from '../../src/tasks/TaskType'
import { context, taskState } from '../support/fixtures'

/** Three task steps in a straight nextStep chain: a -> b -> c. */
const workflow = buildWorkflow('research', '1.0', {
  schemaVersion: 1,
  label: 'Research',
  initialStep: 'a',
  steps: {
    a: { stepType: 'task', taskType: 'CollectRequirement', documentation: '', nextStep: 'b' },
    b: { stepType: 'task', taskType: 'CollectRequirement', documentation: '', nextStep: 'c' },
    c: { stepType: 'task', taskType: 'CollectRequirement', documentation: '' },
  },
})

const registry = () => new TaskTypeRegistry([new CollectRequirement()])

async function harness(types: TaskType[] = [new CollectRequirement()]) {
  const dir = await mkdtemp(join(tmpdir(), 'eng-'))
  const store = new TaskStateStore(dir)
  await store.write(taskState({ workflowId: 'research', currentStepId: 'a' }))
  const ctx = context({ taskDir: dir, order: workflow.order })
  return { engine: new WorkflowEngine(workflow, store, new TaskTypeRegistry(types), ctx), store }
}

const answered = { story: 'why is checkout slow' }

describe('WorkflowEngine', () => {
  it('starts at the step the state names', async () => {
    const { engine } = await harness()
    expect((await engine.current()).id).toBe('a')
  })

  it('rejects an invalid submission and does not advance', async () => {
    const { engine } = await harness()
    const r = await engine.submit('a', 'submit', { question: '' })
    expect(r.ok).toBe(false)
    expect((await engine.current()).id).toBe('a')
  })

  it('advances along nextStep, not along declaration order', async () => {
    const { engine } = await harness()
    expect((await engine.submit('a', 'submit', answered)).ok).toBe(true)
    expect((await engine.current()).id).toBe('b')
  })

  it('records answers and the task result on the completed step', async () => {
    const { engine, store } = await harness()
    await engine.submit('a', 'submit', answered)
    expect((await store.read()).steps.a).toMatchObject({
      status: 'complete',
      answers: answered,
      result: answered,
    })
  })

  it('reports done on a step with no nextStep', async () => {
    const { engine } = await harness()
    await engine.submit('a', 'submit', answered)
    await engine.submit('b', 'submit', answered)
    expect(await engine.submit('c', 'submit', answered)).toEqual({ ok: true, done: true })
  })

  it('stays on the terminal step once the workflow is finished', async () => {
    const { engine } = await harness()
    await engine.submit('a', 'submit', answered)
    await engine.submit('b', 'submit', answered)
    await engine.submit('c', 'submit', answered)
    expect((await engine.current()).id).toBe('c')
  })

  it('goes back to the previous step in traversal order', async () => {
    const { engine } = await harness()
    await engine.submit('a', 'submit', answered)
    await engine.submit('b', 'back', {})
    expect((await engine.current()).id).toBe('a')
  })

  it('back from the first step has nowhere to go', async () => {
    const { engine } = await harness()
    expect(await engine.submit('a', 'back', {})).toEqual({ ok: true, done: false })
    expect((await engine.current()).id).toBe('a')
  })

  it('revise sends the work back to the step that produced it', async () => {
    const { engine } = await harness()
    await engine.submit('a', 'submit', answered)
    await engine.submit('b', 'submit', answered)
    await engine.submit('c', 'revise', {})
    expect((await engine.current()).id).toBe('b')
  })

  it('revise reopens the step it goes back to, so it runs again', async () => {
    const { engine, store } = await harness()
    await engine.submit('a', 'submit', answered)
    await engine.submit('b', 'submit', answered)
    await engine.submit('c', 'revise', {})
    expect((await store.read()).steps.b!.status).toBe('pending')
  })

  it('persists state across a fresh engine instance', async () => {
    const { engine, store } = await harness()
    await engine.submit('a', 'submit', answered)

    // A fresh engine stands in for a restarted extension host.
    const reloaded = new WorkflowEngine(
      workflow,
      store,
      registry(),
      context({ order: workflow.order }),
    )
    expect((await reloaded.current()).id).toBe('b')
  })

  it('edit reopens a completed step and makes it current', async () => {
    const { engine } = await harness()
    await engine.submit('a', 'submit', answered)
    await engine.edit('a')
    expect((await engine.current()).id).toBe('a')
  })

  it('edit marks the edited step and everything after it pending', async () => {
    const { engine, store } = await harness()
    await engine.submit('a', 'submit', answered)
    await engine.submit('b', 'submit', answered)
    await engine.edit('a')

    const state = await store.read()
    expect(state.steps.a!.status).toBe('pending')
    expect(state.steps.b!.status).toBe('pending')
  })

  it('edit keeps earlier answers so they prefill on the way back', async () => {
    const { engine, store } = await harness()
    await engine.submit('a', 'submit', answered)
    await engine.submit('b', 'submit', { story: 'a second answer' })
    await engine.edit('a')

    const state = await store.read()
    expect(state.steps.a!.answers).toEqual(answered)
    expect(state.steps.b!.answers).toEqual({ story: 'a second answer' })
  })

  it('edit rejects an unknown step', async () => {
    const { engine } = await harness()
    await expect(engine.edit('nowhere')).rejects.toThrow(/unknown step/)
  })

  it('names the known taskTypes when a workflow references one that is missing', async () => {
    const { engine } = await harness([])
    await expect(engine.submit('a', 'submit', answered)).rejects.toThrow(
      /unknown taskType "CollectRequirement"/,
    )
  })
})

/**
 * A draft an in-progress step wants to keep — an edited prompt — without
 * claiming the step is finished. It is a write, not a transition.
 */
describe('saveAnswers', () => {
  it('keeps a draft on the current step without advancing it', async () => {
    const { engine, store } = await harness()
    await engine.saveAnswers('a', { edited: { prompt: 'MY OWN WORDS' } })

    const state = await store.read()
    expect(state.currentStepId).toBe('a')
    expect(state.steps.a!.answers).toEqual({ edited: { prompt: 'MY OWN WORDS' } })
    expect(state.steps.a!.status).toBe('in_progress')
  })

  it('merges into what the step already answered rather than replacing it', async () => {
    const { engine, store } = await harness()
    await engine.saveAnswers('a', { story: 'kept' })
    await engine.saveAnswers('a', { edited: { prompt: 'added' } })
    expect((await store.read()).steps.a!.answers).toEqual({
      story: 'kept',
      edited: { prompt: 'added' },
    })
  })

  it('leaves a completed step complete, so a draft cannot reopen it', async () => {
    const { engine, store } = await harness()
    await engine.submit('a', 'submit', answered)
    await engine.saveAnswers('a', { edited: { prompt: 'late' } })

    const state = await store.read()
    expect(state.steps.a!.status).toBe('complete')
    expect(state.currentStepId).toBe('b')
  })

  it('refuses a step the workflow does not have', async () => {
    const { engine } = await harness()
    await expect(engine.saveAnswers('nope', {})).rejects.toThrow(/unknown step/)
  })
})

/**
 * `submit` used to treat any action it did not recognise as a submission, so an
 * affordance whose handler nobody remembered to write completed the step instead
 * of doing nothing. Two of those handlers had to be written for the System Check
 * step alone, which is what made this worth closing. See spec Section 5.
 */
describe('only a nominated action completes a step', () => {
  it('refuses an action the primitive does not nominate', async () => {
    const { engine } = await harness()
    const r = await engine.submit('a', 'copy', answered)
    expect(r.ok).toBe(false)
  })

  it('does not advance on one', async () => {
    const { engine } = await harness()
    await engine.submit('a', 'copy', answered)
    expect((await engine.current()).id).toBe('a')
  })

  it('does not record the step as complete either', async () => {
    const { engine, store } = await harness()
    await engine.submit('a', 'copy', answered)
    expect((await store.read()).steps.a).toBeUndefined()
  })

  it('names the action and what would have worked, since it is a defect report', async () => {
    const { engine } = await harness()
    const r = await engine.submit('a', 'recheck', answered)
    expect(r.ok === false && r.errors.action).toContain('"recheck" does not complete this step')
    expect(r.ok === false && r.errors.action).toContain('"submit"')
  })

  it('still lets the nominated action through', async () => {
    const { engine } = await harness()
    expect(await engine.submit('a', 'submit', answered)).toEqual({ ok: true, done: false })
  })

  // Revise and Back are the engine's own, so they never appear in a
  // primitive's transitions.
  it('still handles the engine’s own backward moves', async () => {
    const { engine } = await harness()
    await engine.submit('a', 'submit', answered)
    expect(await engine.submit('b', 'back', {})).toEqual({ ok: true, done: false })
    expect((await engine.current()).id).toBe('a')
  })
})

describe('a primitive that could never complete', () => {
  const stuck: TaskType = {
    name: 'stuck',
    stepType: 'task',
    title: 'Stuck',
    transitions: [],
    async describe() {
      return { actions: [] }
    },
    validate() {
      return { ok: true, errors: {} }
    },
    async execute() {
      return {}
    },
  }

  it('is refused when the catalogue loads rather than three steps into a task', () => {
    expect(() =>
      new TaskTypeRegistry([stuck]).validateWorkflow('wf', {
        a: { id: 'a', stepType: 'task', taskType: 'stuck', documentation: '' },
      }),
    ).toThrow(/declares no transitions, so the step could never be completed/)
  })
})
