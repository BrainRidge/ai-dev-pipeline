# Task 7: TaskWorkspace — folders, snapshot, workspace file

> Part of the [Phase 1 implementation plan](README.md). Completed and shipped.

**Files:**
- Create: `src/workspace/TaskWorkspace.ts`
- Test: `test/workspace/TaskWorkspace.test.ts`

**Interfaces:**
- Consumes: `TaskStateStore`, `AuditLog`, `buildTaskId`
- Produces: `TaskWorkspace.create(opts): Promise<TaskWorkspace>` where `opts = { tasksRoot, epic, workflowId, platform, workflowYaml }`
- Produces: `ws.dir: string`, `ws.taskId: string`, `ws.hashOfSnapshot(): Promise<string>`, `ws.verifySnapshot(expected: string): Promise<boolean>`, `ws.writeWorkspaceFile(repos: {name,path}[]): Promise<string>`

- [ ] **Step 1: Write the failing test**

```typescript
// test/workspace/TaskWorkspace.test.ts
import { describe, it, expect } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TaskWorkspace } from '../../src/workspace/TaskWorkspace'

const YAML = 'id: research\nlabel: Research\nplatforms: [p]\nsteps: []\n'

async function make() {
  return TaskWorkspace.create({
    tasksRoot: await mkdtemp(join(tmpdir(), 'root-')),
    epic: 'PLAT-1234', workflowId: 'research', platform: 'canada-assisted',
    workflowYaml: YAML, now: new Date('2026-08-14T10:00:00Z'),
  })
}

describe('TaskWorkspace', () => {
  it('builds a task id from epic, workflow and date', async () => {
    expect((await make()).taskId).toBe('PLAT-1234-research-20260814-01')
  })

  it('snapshots the workflow under .engine', async () => {
    const ws = await make()
    expect(await readFile(join(ws.dir, '.engine', 'workflow.yaml'), 'utf8')).toBe(YAML)
  })

  it('detects an unmodified snapshot', async () => {
    const ws = await make()
    expect(await ws.verifySnapshot(await ws.hashOfSnapshot())).toBe(true)
  })

  it('detects a tampered snapshot', async () => {
    const ws = await make()
    const original = await ws.hashOfSnapshot()
    await writeFile(join(ws.dir, '.engine', 'workflow.yaml'), `${YAML}# edited\n`)
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

  it('increments the counter for a second task on the same day', async () => {
    const root = await mkdtemp(join(tmpdir(), 'root-'))
    const opts = { tasksRoot: root, epic: 'PLAT-1', workflowId: 'research',
                   platform: 'p', workflowYaml: YAML, now: new Date('2026-08-14T10:00:00Z') }
    await TaskWorkspace.create(opts)
    expect((await TaskWorkspace.create(opts)).taskId).toBe('PLAT-1-research-20260814-02')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/workspace/TaskWorkspace.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/workspace/TaskWorkspace.ts`**

```typescript
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildTaskId } from '../engine/taskId'

export interface CreateOpts {
  tasksRoot: string
  epic: string
  workflowId: string
  platform: string
  workflowYaml: string
  now?: Date
}

export class TaskWorkspace {
  private constructor(readonly dir: string, readonly taskId: string) {}

  static async create(opts: CreateOpts): Promise<TaskWorkspace> {
    const now = opts.now ?? new Date()
    await mkdir(opts.tasksRoot, { recursive: true })
    const existing = await readdir(opts.tasksRoot).catch(() => [] as string[])

    let counter = 1
    let taskId = buildTaskId(opts.epic, opts.workflowId, now, counter)
    while (existing.includes(taskId)) {
      counter += 1
      taskId = buildTaskId(opts.epic, opts.workflowId, now, counter)
    }

    const dir = join(opts.tasksRoot, taskId)
    await mkdir(join(dir, '.engine'), { recursive: true })
    // Snapshot: this task runs the definition it started with, immune to
    // extension updates. See spec D8.
    await writeFile(join(dir, '.engine', 'workflow.yaml'), opts.workflowYaml, 'utf8')
    return new TaskWorkspace(dir, taskId)
  }

  static async open(dir: string, taskId: string): Promise<TaskWorkspace> {
    return new TaskWorkspace(dir, taskId)
  }

  async snapshotYaml(): Promise<string> {
    return readFile(join(this.dir, '.engine', 'workflow.yaml'), 'utf8')
  }

  async hashOfSnapshot(): Promise<string> {
    return createHash('sha256').update(await this.snapshotYaml()).digest('hex')
  }

  /** Detection, not prevention — every developer has filesystem access.
   *  The goal is that deviation is visible in the audit trail. See spec Section 7. */
  async verifySnapshot(expected: string): Promise<boolean> {
    return (await this.hashOfSnapshot()) === expected
  }

  async writeWorkspaceFile(repos: { name: string; path: string }[]): Promise<string> {
    const file = join(this.dir, `${this.taskId}.code-workspace`)
    const content = {
      folders: [...repos, { name: this.taskId, path: this.dir }],
      settings: { 'aiDevWorkflow.taskId': this.taskId },
    }
    await writeFile(file, JSON.stringify(content, null, 2), 'utf8')
    return file
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/workspace/TaskWorkspace.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: task workspace with workflow snapshot and hash verification"
```
