import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AuditLog } from '../audit/AuditLog'
import type { WorkflowCatalog } from '../engine/WorkflowCatalog'
import { TaskStateStore, type TaskState } from '../state/TaskStateStore'
import { TaskWorkspace } from '../workspace/TaskWorkspace'
import type { SetupSelection } from './SetupSelection'
import type { Answers } from '../tasks/context'

/** Workflows are versioned by filename: researchTaskWorkflow_1_0.json. */
export function workflowFilename(id: string, version: string): string {
  return `${id}_${version.replace('.', '_')}.json`
}

export interface CreatedTask {
  taskId: string
  dir: string
  state: TaskState
}

/**
 * Create a task on disk from a completed setup form.
 *
 * Lifted out of `TaskSession.startWith`, whose first half was already made
 * entirely of core pieces — `TaskWorkspace.create`, `TaskStateStore`,
 * `AuditLog` — and wrapped in a `vscode.ExtensionContext` only to find two
 * directories. Those are parameters now, so either host can create a task and
 * the other can resume it. The second half of `startWith` (opening pane 2)
 * stays in VS Code, because pane 2 is still VS Code-only. See spec Section 19.
 *
 * The `inputs` map and the `task-started` audit entry are deliberately
 * unchanged: one state format with two writers only works if both write the
 * same thing.
 */
export async function createTask(input: {
  tasksRoot: string
  workflowsDir: string
  catalog: WorkflowCatalog
  selection: SetupSelection
}): Promise<CreatedTask> {
  const { platform, epic, workflowId } = input.selection
  const workflow = input.catalog.get(workflowId)

  const source = await readFile(
    join(input.workflowsDir, workflowFilename(workflow.id, workflow.version)),
    'utf8',
  )
  const ws = await TaskWorkspace.create({
    tasksRoot: input.tasksRoot,
    epic,
    workflowId,
    platform,
    workflowJson: source,
  })

  const store = new TaskStateStore(ws.dir)
  // Task-level facts, readable by every step as {{task.<id>}} and recorded once
  // in the audit log. See spec Section 8.
  const inputs: Answers = {
    services: input.selection.services,
    taskType: workflowId,
    baseBranch: input.selection.baseBranch,
    workDir: input.selection.workDir,
  }
  if (input.selection.featureStory) inputs.featureStory = input.selection.featureStory

  const state: TaskState = {
    schemaVersion: 1,
    taskId: ws.taskId,
    workflowId,
    workflowVersion: workflow.version,
    platform,
    epic,
    currentStepId: workflow.initialStep,
    workflowHash: await ws.hashOfSnapshot(),
    inputs,
    steps: {},
  }
  await store.write(state)
  await new AuditLog(ws.dir).append({
    kind: 'task-started',
    data: { taskId: ws.taskId, workflowId, version: workflow.version, platform, epic, inputs },
  })

  return { taskId: ws.taskId, dir: ws.dir, state }
}
