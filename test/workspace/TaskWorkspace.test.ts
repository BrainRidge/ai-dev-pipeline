import { describe, it, expect } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TaskWorkspace } from '../../src/workspace/TaskWorkspace'

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
