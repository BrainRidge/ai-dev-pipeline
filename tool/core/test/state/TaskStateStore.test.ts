import { describe, it, expect } from 'vitest'
import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TaskStateStore, type TaskState } from '../../src/state/TaskStateStore'

const sample: TaskState = {
  schemaVersion: 1,
  taskId: 'PLAT-1-research-20260814-01',
  workflowId: 'research',
  workflowVersion: '1.0',
  platform: 'canada-assisted',
  epic: 'PLAT-1',
  currentStepId: 'scope',
  workflowHash: 'abc',
  inputs: { services: ['payments'] },
  steps: { scope: { status: 'in_progress' } },
}

describe('TaskStateStore', () => {
  it('round-trips state', async () => {
    const store = new TaskStateStore(await mkdtemp(join(tmpdir(), 'st-')))
    await store.write(sample)
    expect(await store.read()).toEqual(sample)
  })

  it('reports absence before any write', async () => {
    const store = new TaskStateStore(await mkdtemp(join(tmpdir(), 'st-')))
    expect(await store.exists()).toBe(false)
  })

  it('reports presence after a write', async () => {
    const store = new TaskStateStore(await mkdtemp(join(tmpdir(), 'st-')))
    await store.write(sample)
    expect(await store.exists()).toBe(true)
  })

  it('leaves no temp file behind', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'st-'))
    const store = new TaskStateStore(dir)
    await store.write(sample)
    expect(await readdir(join(dir, '.engine'))).toEqual(['_state.json'])
  })

  it('keeps engine files out of the task folder root', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'st-'))
    await new TaskStateStore(dir).write(sample)
    expect(await readdir(dir)).toEqual(['.engine'])
  })

  it('overwrites cleanly on a second write', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'st-'))
    const store = new TaskStateStore(dir)
    await store.write(sample)
    await store.write({ ...sample, currentStepId: 'analyse' })
    expect((await store.read()).currentStepId).toBe('analyse')
    expect(await readdir(join(dir, '.engine'))).toEqual(['_state.json'])
  })
})
