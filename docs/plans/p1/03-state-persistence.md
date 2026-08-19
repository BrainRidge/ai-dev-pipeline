# Task 3: Task state persistence

> Part of the [Phase 1 implementation plan](README.md). Completed and shipped.

**Files:**
- Create: `src/state/TaskStateStore.ts`
- Test: `test/state/TaskStateStore.test.ts`

**Interfaces:**
- Consumes: `buildTaskId` (Task 1), `TaskState` (Global Constraints)
- Produces: `new TaskStateStore(taskDir: string)`, `store.read(): Promise<TaskState>`, `store.write(s: TaskState): Promise<void>`, `store.exists(): Promise<boolean>`

- [ ] **Step 1: Write the failing test**

```typescript
// test/state/TaskStateStore.test.ts
import { describe, it, expect } from 'vitest'
import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TaskStateStore } from '../../src/state/TaskStateStore'
import type { TaskState } from '../../src/state/TaskStateStore'

const sample: TaskState = {
  schemaVersion: 1, taskId: 'PLAT-1-research-20260814-01', workflowId: 'research',
  platform: 'canada-assisted', epic: 'PLAT-1', currentStepId: 'scope',
  workflowHash: 'abc', steps: { scope: { status: 'in_progress' } },
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

  it('leaves no temp file behind', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'st-'))
    const store = new TaskStateStore(dir)
    await store.write(sample)
    expect(await readdir(join(dir, '.engine'))).toEqual(['_state.json'])
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/state/TaskStateStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/state/TaskStateStore.ts`**

```typescript
import { mkdir, readFile, rename, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'

export interface StepRecord {
  status: 'pending' | 'in_progress' | 'complete'
  answers?: Record<string, unknown>
  result?: Record<string, unknown>
}

export interface TaskState {
  schemaVersion: 1
  taskId: string
  workflowId: string
  platform: string
  epic: string
  currentStepId: string
  workflowHash: string
  steps: Record<string, StepRecord>
}

export class TaskStateStore {
  private readonly engineDir: string
  private readonly file: string

  constructor(taskDir: string) {
    this.engineDir = join(taskDir, '.engine')
    this.file = join(this.engineDir, '_state.json')
  }

  async exists(): Promise<boolean> {
    try { await access(this.file); return true } catch { return false }
  }

  async read(): Promise<TaskState> {
    return JSON.parse(await readFile(this.file, 'utf8')) as TaskState
  }

  /** Atomic: temp file then rename, so an interrupted write cannot corrupt the task. */
  async write(state: TaskState): Promise<void> {
    await mkdir(this.engineDir, { recursive: true })
    const tmp = `${this.file}.tmp`
    await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8')
    await rename(tmp, this.file)
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/state/TaskStateStore.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: atomic task state persistence"
```
