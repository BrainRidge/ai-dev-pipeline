# Task 10: Start Task command and resume-on-open

> Part of the [Phase 1 implementation plan](README.md). Completed and shipped.

**Files:**
- Modify: `src/extension.ts`
- Create: `src/session/TaskSession.ts`
- Test: `test/session/TaskSession.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–9
- Produces: `TaskSession.start(deps)`, `TaskSession.resume(deps, taskDir, taskId)`, `session.show(): void`

- [ ] **Step 1: Write the failing test for resume detection**

```typescript
// test/session/TaskSession.test.ts
import { describe, it, expect } from 'vitest'
import { taskIdFromWorkspaceSettings } from '../../src/session/TaskSession'

describe('taskIdFromWorkspaceSettings', () => {
  it('reads the breadcrumb', () => {
    expect(taskIdFromWorkspaceSettings({ 'aiDevWorkflow.taskId': 'T-1' })).toBe('T-1')
  })

  it('returns undefined when absent', () => {
    expect(taskIdFromWorkspaceSettings({})).toBeUndefined()
  })

  it('treats an empty string as absent', () => {
    expect(taskIdFromWorkspaceSettings({ 'aiDevWorkflow.taskId': '' })).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/session/TaskSession.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/session/TaskSession.ts`**

```typescript
import * as vscode from 'vscode'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import { workflowSchema } from '../engine/schema'
import { WorkflowCatalog } from '../engine/WorkflowCatalog'
import { WorkflowEngine } from '../engine/WorkflowEngine'
import { buildDescriptor } from '../engine/StepDescriptor'
import { TaskStateStore } from '../state/TaskStateStore'
import { TaskWorkspace } from '../workspace/TaskWorkspace'
import { AuditLog } from '../audit/AuditLog'
import { WebviewBridge } from '../bridge/WebviewBridge'
import { buildRegistry, defaultHandlers } from '../steps/registry'

export function taskIdFromWorkspaceSettings(settings: Record<string, unknown>): string | undefined {
  const v = settings['aiDevWorkflow.taskId']
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

export function tasksRoot(): string {
  const configured = vscode.workspace.getConfiguration('aiDevWorkflow').get<string>('tasksRoot')
  return configured && configured.length > 0 ? configured : join(homedir(), 'ai-dev-workflow', 'tasks')
}

export class TaskSession {
  private constructor(
    private readonly engine: WorkflowEngine,
    private readonly bridge: WebviewBridge,
    private readonly panel: vscode.WebviewPanel,
    private readonly workflow: ReturnType<typeof workflowSchema.parse>,
    private readonly ctx: { platform: { id: string; label: string; services: never[] }
                          ; taskDir: string; answersOf: (id: string) => Record<string, unknown> },
    private readonly audit: AuditLog,
  ) {
    this.bridge.onAction(async ({ stepId, actionId, values }) => {
      await this.audit.append({ kind: 'action', stepId, data: { actionId, values } })
      const result = await this.engine.submit(stepId, actionId, values)
      await this.refresh(values, result.ok ? {} : result.errors)
    })
  }

  static async start(context: vscode.ExtensionContext): Promise<TaskSession | undefined> {
    const catalog = await WorkflowCatalog.load(join(context.extensionPath, 'workflows'))

    const platform = await pick(catalog.platforms().map(p => ({ label: p.label, id: p.id })),
                                'Select your platform')
    if (!platform) return undefined

    const epic = await vscode.window.showInputBox({
      prompt: 'Epic key', placeHolder: 'PLAT-1234',
      validateInput: v => v.trim().length === 0 ? 'An epic key is required' : undefined,
    })
    if (!epic) return undefined

    const workflows = catalog.forPlatform(platform)
    const workflowId = await pick(workflows.map(w => ({ label: w.label, id: w.id })), 'Select task type')
    if (!workflowId) return undefined

    const yamlText = await readFile(join(context.extensionPath, 'workflows', `${workflowId}.yaml`), 'utf8')
    const ws = await TaskWorkspace.create({
      tasksRoot: tasksRoot(), epic, workflowId, platform, workflowYaml: yamlText,
    })

    const store = new TaskStateStore(ws.dir)
    await store.write({
      schemaVersion: 1, taskId: ws.taskId, workflowId, platform, epic,
      currentStepId: catalog.get(workflowId).steps[0]!.id,
      workflowHash: await ws.hashOfSnapshot(), steps: {},
    })

    return TaskSession.open(context, ws, store, catalog.get(workflowId))
  }

  static async resume(context: vscode.ExtensionContext, taskId: string): Promise<TaskSession | undefined> {
    const dir = join(tasksRoot(), taskId)
    const store = new TaskStateStore(dir)
    if (!(await store.exists())) return undefined

    const state = await store.read()
    const ws = await TaskWorkspace.open(dir, taskId)
    const workflow = workflowSchema.parse(parse(await ws.snapshotYaml()))

    if (!(await ws.verifySnapshot(state.workflowHash))) {
      await new AuditLog(dir).append({ kind: 'snapshot-modified', data: { taskId } })
      void vscode.window.showWarningMessage(
        'This task\'s workflow definition has been modified since the task started. ' +
        'Continuing with the modified version; the change has been recorded in the audit log.')
    }
    return TaskSession.open(context, ws, store, workflow)
  }

  private static async open(
    context: vscode.ExtensionContext, ws: TaskWorkspace,
    store: TaskStateStore, workflow: ReturnType<typeof workflowSchema.parse>,
  ): Promise<TaskSession> {
    const state = await store.read()
    const catalog = await WorkflowCatalog.load(join(context.extensionPath, 'workflows'))
    const platform = catalog.platforms().find(p => p.id === state.platform)!

    const panel = vscode.window.createWebviewPanel(
      'aiDevWorkflow', workflow.label, vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(join(context.extensionPath, 'out'))] })

    const bridge = new WebviewBridge(panel)
    const nonce = Math.random().toString(36).slice(2)
    panel.webview.html = bridge.html(
      panel.webview.asWebviewUri(vscode.Uri.file(join(context.extensionPath, 'out', 'webview.js'))), nonce)

    const ctx = {
      platform, taskDir: ws.dir,
      answersOf: (id: string) => state.steps[id]?.answers ?? {},
    }
    const engine = new WorkflowEngine(workflow, store, buildRegistry(defaultHandlers(ctx)), ctx as never)
    const session = new TaskSession(engine, bridge, panel, workflow, ctx as never, new AuditLog(ws.dir))
    await session.refresh({}, {})
    return session
  }

  private async refresh(values: Record<string, unknown>, errors: Record<string, string>): Promise<void> {
    const state = await this.engine.state()
    const step = await this.engine.current()
    const handler = buildRegistry(defaultHandlers(this.ctx as never)).get(step.kind)!
    this.bridge.render(buildDescriptor({
      workflow: this.workflow, state, handler, ctx: this.ctx as never, values, errors,
    }))
  }

  show(): void { this.panel.reveal() }
}

async function pick(items: { label: string; id: string }[], placeHolder: string): Promise<string | undefined> {
  const chosen = await vscode.window.showQuickPick(items, { placeHolder })
  return chosen?.id
}
```

Note: `defaultHandlers` gains a `ctx` parameter here — update `src/steps/registry.ts` so `defaultHandlers(ctx: StepContext): StepHandler[]`. Later tasks add handlers to this list.

- [ ] **Step 4: Wire activation in `src/extension.ts`**

```typescript
import * as vscode from 'vscode'
import { TaskSession, taskIdFromWorkspaceSettings, tasksRoot } from './session/TaskSession'
import { readdir } from 'node:fs/promises'

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  context.subscriptions.push(
    vscode.commands.registerCommand('aiDevWorkflow.startTask', async () => {
      const session = await TaskSession.start(context)
      session?.show()
    }),
    vscode.commands.registerCommand('aiDevWorkflow.resumeTask', async () => {
      const ids = await readdir(tasksRoot()).catch(() => [] as string[])
      const chosen = await vscode.window.showQuickPick(ids, { placeHolder: 'Resume which task?' })
      if (!chosen) return
      ;(await TaskSession.resume(context, chosen))?.show()
    }),
  )

  // Resume automatically when a generated workspace is opened. This is what makes
  // the workflow survive the extension-host restart caused by opening the workspace.
  const settings = vscode.workspace.getConfiguration().get<Record<string, unknown>>('aiDevWorkflow') ?? {}
  const taskId = taskIdFromWorkspaceSettings({
    'aiDevWorkflow.taskId': vscode.workspace.getConfiguration('aiDevWorkflow').get<string>('taskId') ?? '',
  })
  if (taskId) (await TaskSession.resume(context, taskId))?.show()
}

export function deactivate(): void {}
```

- [ ] **Step 5: Run all tests and lint**

Run: `npx vitest run && npm run lint && npm run build`
Expected: all PASS, lint clean, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: start and resume task sessions"
```
