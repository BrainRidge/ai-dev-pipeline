import { describe, it, expect } from 'vitest'
import { mkdir, mkdtemp, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isFinished, listUnfinishedTasks, taskLabel } from '../../src/session/taskIndex'
import { taskState } from '../support/fixtures'
import type { TaskState } from '../../src/state/TaskStateStore'

async function root(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'idx-'))
}

async function writeTask(
  dir: string,
  taskId: string,
  state: Partial<TaskState>,
  mtime?: Date,
): Promise<void> {
  const engine = join(dir, taskId, '.engine')
  await mkdir(engine, { recursive: true })
  const file = join(engine, '_state.json')
  await writeFile(file, JSON.stringify(taskState({ taskId, ...state })), 'utf8')
  if (mtime) await utimes(file, mtime, mtime)
}

/**
 * Whether a task is finished is not recorded anywhere, but it does not need to
 * be: the engine parks currentStepId on a step and marks it complete only when
 * that step is terminal. Every other state leaves the current step unfinished.
 */
describe('isFinished', () => {
  it('is true once the step the task is parked on is complete', () => {
    expect(
      isFinished(taskState({ currentStepId: 'c', steps: { c: { status: 'complete' } } })),
    ).toBe(true)
  })

  it('is false mid-workflow, where earlier steps are complete but this one is not', () => {
    expect(
      isFinished(
        taskState({
          currentStepId: 'b',
          steps: { a: { status: 'complete' }, b: { status: 'pending' } },
        }),
      ),
    ).toBe(false)
  })

  it('is false for a task that has recorded nothing yet', () => {
    expect(isFinished(taskState({ currentStepId: 'a', steps: {} }))).toBe(false)
  })
})

describe('listUnfinishedTasks', () => {
  it('finds nothing in a directory that does not exist', async () => {
    expect(await listUnfinishedTasks(join(await root(), 'nope'))).toEqual([])
  })

  it('reports what the sidebar needs to describe a task', async () => {
    const dir = await root()
    await writeTask(dir, 'PLAT-1-bugFixWorkflow-20260818-01', {
      epic: 'PLAT-1',
      workflowId: 'bugFixWorkflow',
      currentStepId: 'diagnosis',
    })

    expect(await listUnfinishedTasks(dir)).toMatchObject([
      {
        taskId: 'PLAT-1-bugFixWorkflow-20260818-01',
        epic: 'PLAT-1',
        workflowId: 'bugFixWorkflow',
        currentStepId: 'diagnosis',
      },
    ])
  })

  it('hides finished tasks, which is what "continue" means', async () => {
    const dir = await root()
    await writeTask(dir, 'done-01', {
      currentStepId: 'c',
      steps: { c: { status: 'complete' } },
    })
    await writeTask(dir, 'open-01', { currentStepId: 'b' })

    expect((await listUnfinishedTasks(dir)).map((t) => t.taskId)).toEqual(['open-01'])
  })

  it('skips a folder with no state, so an abandoned experiment is not an error', async () => {
    const dir = await root()
    await mkdir(join(dir, 'never-started'), { recursive: true })
    await writeTask(dir, 'open-01', {})
    expect((await listUnfinishedTasks(dir)).map((t) => t.taskId)).toEqual(['open-01'])
  })

  it('skips unreadable state rather than failing the whole list', async () => {
    const dir = await root()
    await mkdir(join(dir, 'corrupt-01', '.engine'), { recursive: true })
    await writeFile(join(dir, 'corrupt-01', '.engine', '_state.json'), '{ not json', 'utf8')
    await writeTask(dir, 'open-01', {})
    expect((await listUnfinishedTasks(dir)).map((t) => t.taskId)).toEqual(['open-01'])
  })

  it('puts the most recently touched task first, which is the one you want', async () => {
    const dir = await root()
    await writeTask(dir, 'old-01', {}, new Date('2026-01-01T00:00:00Z'))
    await writeTask(dir, 'new-01', {}, new Date('2026-08-01T00:00:00Z'))
    await writeTask(dir, 'mid-01', {}, new Date('2026-04-01T00:00:00Z'))

    expect((await listUnfinishedTasks(dir)).map((t) => t.taskId)).toEqual([
      'new-01',
      'mid-01',
      'old-01',
    ])
  })
})

describe('taskLabel', () => {
  const summary = {
    taskId: 'PLAT-1-bugFixWorkflow-20260818-01',
    epic: 'PLAT-1',
    workflowId: 'bugFixWorkflow',
    currentStepId: 'diagnosis',
    updatedAt: Date.parse('2026-08-18T09:30:00Z'),
  }

  it('reads as epic, task type and date — enough to tell two apart', () => {
    expect(taskLabel(summary, 'Bug Fix')).toBe('PLAT-1 · Bug Fix · 2026-08-18')
  })

  it('falls back to the workflow id when the catalogue no longer has it', () => {
    expect(taskLabel(summary, undefined)).toBe('PLAT-1 · bugFixWorkflow · 2026-08-18')
  })
})
