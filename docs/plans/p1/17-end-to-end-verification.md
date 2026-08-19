# Task 17: End-to-end verification against the acceptance criteria

> Part of the [Phase 1 implementation plan](README.md). Completed and shipped.

**Files:**
- Create: `test/integration/research-workflow.test.ts`, `.vscode-test.mjs`
- Create: `docs/MANUAL-ACCEPTANCE.md`

**Interfaces:**
- Consumes: everything

- [ ] **Step 1: Configure the integration runner**

```javascript
// .vscode-test.mjs
import { defineConfig } from '@vscode/test-cli'
export default defineConfig({ files: 'out/test/integration/**/*.test.js', version: 'stable' })
```

- [ ] **Step 2: Write the failing integration test**

```typescript
// test/integration/research-workflow.test.ts
import * as assert from 'node:assert'
import * as vscode from 'vscode'
import { join } from 'node:path'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { TaskWorkspace } from '../../src/workspace/TaskWorkspace'
import { TaskStateStore } from '../../src/state/TaskStateStore'

suite('research workflow', () => {
  test('the extension activates and registers its commands', async () => {
    const commands = await vscode.commands.getCommands(true)
    assert.ok(commands.includes('aiDevWorkflow.startTask'))
    assert.ok(commands.includes('aiDevWorkflow.resumeTask'))
  })

  test('a generated workspace file carries the taskId breadcrumb', async () => {
    const root = await mkdtemp(join(tmpdir(), 'e2e-'))
    const ws = await TaskWorkspace.create({
      tasksRoot: root, epic: 'PLAT-1', workflowId: 'research',
      platform: 'canada-assisted', workflowYaml: 'id: research\nlabel: R\nplatforms: [p]\nsteps: []\n',
    })
    const file = await ws.writeWorkspaceFile([])
    const parsed = JSON.parse(await readFile(file, 'utf8'))
    assert.strictEqual(parsed.settings['aiDevWorkflow.taskId'], ws.taskId)
  })

  test('state survives a simulated host restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'e2e-'))
    const ws = await TaskWorkspace.create({
      tasksRoot: root, epic: 'PLAT-2', workflowId: 'research',
      platform: 'canada-assisted', workflowYaml: 'id: research\nlabel: R\nplatforms: [p]\nsteps: []\n',
    })
    const store = new TaskStateStore(ws.dir)
    await store.write({ schemaVersion: 1, taskId: ws.taskId, workflowId: 'research',
      platform: 'canada-assisted', epic: 'PLAT-2', currentStepId: 'context',
      workflowHash: await ws.hashOfSnapshot(), steps: { scope: { status: 'complete', answers: { q: 'why' } } } })

    // A fresh store instance stands in for a restarted extension host.
    const reopened = new TaskStateStore(ws.dir)
    const state = await reopened.read()
    assert.strictEqual(state.currentStepId, 'context')
    assert.strictEqual(state.steps.scope!.answers!.q, 'why')
  })

  test('snapshot tampering is detected', async () => {
    const root = await mkdtemp(join(tmpdir(), 'e2e-'))
    const ws = await TaskWorkspace.create({
      tasksRoot: root, epic: 'PLAT-3', workflowId: 'research',
      platform: 'canada-assisted', workflowYaml: 'id: research\nlabel: R\nplatforms: [p]\nsteps: []\n',
    })
    const original = await ws.hashOfSnapshot()
    await writeFile(join(ws.dir, '.engine', 'workflow.yaml'), 'id: tampered\n')
    assert.strictEqual(await ws.verifySnapshot(original), false)
  })
})
```

- [ ] **Step 3: Run it and confirm it fails, then passes**

Run: `npm run build && npm run test:integration`
Expected: initially FAIL if any wiring is missing; PASS once complete.

- [ ] **Step 4: Write `docs/MANUAL-ACCEPTANCE.md` for the criteria a test cannot cover**

Criteria 6, 7 and 8 involve Copilot and a human, so they are a manual script. Write the file with one checkbox per criterion from spec Section 14, each stating the exact action and the exact expected result. Criterion 11 is the important one:

```markdown
- [ ] **11. A tool developer can add a workflow with no TypeScript and no HTML.**
      Copy `workflows/research.yaml` to `workflows/scratch.yaml`, change `id` to `scratch`
      and `label` to `Scratch Task`, and reorder two steps. Rebuild and reload.
      Expected: "Scratch Task" appears as a task type and runs in the new order.
      **No file under `src/` or `webview/` was touched.**
      If this required a code change, the architecture did not deliver D6 — stop and
      report which step kind forced it.
```

- [ ] **Step 5: Walk the manual script end to end**

Requires Copilot installed and agent mode enabled (Task 0, Step 1). Record any criterion that fails, with what happened instead.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "test: end-to-end integration and manual acceptance script"
```
