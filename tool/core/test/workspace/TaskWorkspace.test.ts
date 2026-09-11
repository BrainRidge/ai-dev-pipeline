import { describe, it, expect } from 'vitest'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TaskWorkspace, type CreateOpts } from '../../src/workspace/TaskWorkspace'
import { buildTaskId } from '../../src/engine/taskId'

const SOURCE = JSON.stringify({ schemaVersion: 1, label: 'Research', initialStep: 'a', steps: {} })

async function make(epic = 'PLAT-1234') {
  return TaskWorkspace.create({
    tasksRoot: await mkdtemp(join(tmpdir(), 'root-')),
    epic,
    workflowId: 'research',
    platform: 'canada-assisted',
    workflowJson: SOURCE,
    now: new Date('2026-08-14T10:00:00Z'),
  })
}

describe('TaskWorkspace', () => {
  it('builds a task id from epic, workflow and date', async () => {
    expect((await make()).taskId).toBe('PLAT-1234-research-20260814-01')
  })

  it('sanitises an epic containing path separators', async () => {
    expect((await make('feature/PLAT 9')).taskId).toBe('feature-PLAT-9-research-20260814-01')
  })

  it('snapshots the workflow source under .engine', async () => {
    const ws = await make()
    expect(await readFile(join(ws.dir, '.engine', 'workflow.json'), 'utf8')).toBe(SOURCE)
  })

  it('detects an unmodified snapshot', async () => {
    const ws = await make()
    expect(await ws.verifySnapshot(await ws.hashOfSnapshot())).toBe(true)
  })

  it('detects a tampered snapshot', async () => {
    const ws = await make()
    const original = await ws.hashOfSnapshot()
    await writeFile(join(ws.dir, '.engine', 'workflow.json'), `${SOURCE} `)
    expect(await ws.verifySnapshot(original)).toBe(false)
  })

  it('writes a .code-workspace carrying the taskId breadcrumb', async () => {
    const ws = await make()
    const file = await ws.writeWorkspaceFile([{ name: 'payments', path: '/code/payments' }])
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    expect(parsed.settings['aiDevWorkflow.taskId']).toBe(ws.taskId)
    expect(parsed.folders).toEqual([
      { name: 'payments', path: '/code/payments' },
      { name: ws.taskId, path: ws.dir },
    ])
  })

  it('always mounts the task folder as a workspace root', async () => {
    const ws = await make()
    const parsed = JSON.parse(await readFile(await ws.writeWorkspaceFile([]), 'utf8'))
    expect(parsed.folders).toEqual([{ name: ws.taskId, path: ws.dir }])
  })

  it('increments the counter for a second task on the same day', async () => {
    const root = await mkdtemp(join(tmpdir(), 'root-'))
    const opts = {
      tasksRoot: root,
      epic: 'PLAT-1',
      workflowId: 'research',
      platform: 'p',
      workflowJson: SOURCE,
      now: new Date('2026-08-14T10:00:00Z'),
    }
    await TaskWorkspace.create(opts)
    expect((await TaskWorkspace.create(opts)).taskId).toBe('PLAT-1-research-20260814-02')
  })

  it('reopens an existing task without recreating it', async () => {
    const ws = await make()
    const reopened = await TaskWorkspace.open(ws.dir, ws.taskId)
    expect(await reopened.snapshotJson()).toBe(SOURCE)
  })
})

/**
 * Two tasks must never share a folder. They did, on a real machine: the counter
 * that disambiguates them compared ids with `Array.includes`, which is
 * case-sensitive, while macOS and Windows filesystems are not. An epic typed
 * `EPIC-001` once and `epic-001` later produced ids that looked different to the
 * comparison and named one directory to the disk — so the second task adopted
 * the first one's folder and overwrote its `_state.json`, leaving two panels
 * writing the same file and a step that would not advance however often Done was
 * pressed.
 */
describe('two tasks never share a folder', () => {
  const opts = (over: Partial<CreateOpts>): CreateOpts => ({
    tasksRoot: '',
    epic: 'EPIC-001',
    workflowId: 'newFeatureWorkflow',
    platform: 'canada-assisted',
    workflowJson: '{"schemaVersion":1,"label":"R","initialStep":"a","steps":{}}',
    now: new Date('2026-08-24T10:00:00Z'),
    ...over,
  })

  it('gives the second task of the day its own folder', async () => {
    const tasksRoot = await mkdtemp(join(tmpdir(), 'tasks-'))
    const first = await TaskWorkspace.create(opts({ tasksRoot }))
    const second = await TaskWorkspace.create(opts({ tasksRoot }))

    expect(first.taskId).toMatch(/-01$/)
    expect(second.taskId).toMatch(/-02$/)
    expect(second.dir).not.toBe(first.dir)
  })

  // The bug, exactly. On a case-insensitive filesystem these two ids name one
  // directory; on a case-sensitive one they name two. Either way neither task
  // may end up in the other's folder.
  it('does not collide when the epic differs only by case', async () => {
    const tasksRoot = await mkdtemp(join(tmpdir(), 'tasks-'))
    const upper = await TaskWorkspace.create(opts({ tasksRoot, epic: 'EPIC-001' }))
    const lower = await TaskWorkspace.create(opts({ tasksRoot, epic: 'epic-001' }))

    expect(lower.dir.toLowerCase()).not.toBe(upper.dir.toLowerCase())
  })

  it('leaves the first task’s snapshot untouched', async () => {
    const tasksRoot = await mkdtemp(join(tmpdir(), 'tasks-'))
    const first = await TaskWorkspace.create(
      opts({ tasksRoot, epic: 'EPIC-001', workflowJson: '{"first":true}' }),
    )
    await TaskWorkspace.create(opts({ tasksRoot, epic: 'epic-001', workflowJson: '{"second":true}' }))

    expect(await first.snapshotJson()).toBe('{"first":true}')
  })

  it('claims a folder a previous run left behind, rather than adopting it', async () => {
    const tasksRoot = await mkdtemp(join(tmpdir(), 'tasks-'))
    // A folder with the name the first task would want, put there by anything.
    await mkdir(join(tasksRoot, buildTaskId('EPIC-001', 'newFeatureWorkflow', opts({}).now!, 1)), {
      recursive: true,
    })

    const created = await TaskWorkspace.create(opts({ tasksRoot }))
    expect(created.taskId).toMatch(/-02$/)
  })

  it('gives up rather than looping forever once a day is full', async () => {
    const tasksRoot = await mkdtemp(join(tmpdir(), 'tasks-'))
    const now = opts({}).now!
    for (let n = 1; n <= 99; n++) {
      await mkdir(join(tasksRoot, buildTaskId('EPIC-001', 'newFeatureWorkflow', now, n)), {
        recursive: true,
      })
    }

    await expect(TaskWorkspace.create(opts({ tasksRoot }))).rejects.toThrow(
      /already 99 tasks for EPIC-001/,
    )
  })
})
