import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { TaskState } from '../state/TaskStateStore'

/** What the sidebar needs to offer a saved task back to the developer. */
export interface TaskSummary {
  taskId: string
  epic: string
  workflowId: string
  /** The step the task stopped on. */
  currentStepId: string
  /** Milliseconds. Used only for ordering and for the date in the label. */
  updatedAt: number
}

/**
 * Whether a task is done is not recorded anywhere, and does not need to be.
 * The engine moves currentStepId to `nextStep` on every transition, so the step
 * it is parked on is marked complete in exactly one case: that step was
 * terminal. Anything else is a task with work left in it.
 */
export function isFinished(state: Pick<TaskState, 'currentStepId' | 'steps'>): boolean {
  return state.steps?.[state.currentStepId]?.status === 'complete'
}

/**
 * The unfinished tasks under `tasksRoot`, most recently touched first.
 *
 * A folder that cannot be read as a task is skipped rather than reported. These
 * directories accumulate abandoned experiments, and one unparseable file must
 * not cost the developer the whole list.
 */
export async function listUnfinishedTasks(tasksRoot: string): Promise<TaskSummary[]> {
  const entries = await readdir(tasksRoot, { withFileTypes: true }).catch(() => [])

  const found: TaskSummary[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue

    const file = join(tasksRoot, entry.name, '.engine', '_state.json')
    const summary = await summarise(entry.name, file)
    if (summary) found.push(summary)
  }

  return found.sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Epic, task type and date — enough to tell two of your own tasks apart. */
export function taskLabel(summary: TaskSummary, workflowLabel: string | undefined): string {
  const day = new Date(summary.updatedAt).toISOString().slice(0, 10)
  return `${summary.epic} · ${workflowLabel ?? summary.workflowId} · ${day}`
}

async function summarise(taskId: string, file: string): Promise<TaskSummary | undefined> {
  try {
    const state = JSON.parse(await readFile(file, 'utf8')) as TaskState
    if (!state.currentStepId || isFinished(state)) return undefined
    return {
      taskId,
      epic: state.epic ?? '',
      workflowId: state.workflowId ?? '',
      currentStepId: state.currentStepId,
      updatedAt: (await stat(file)).mtimeMs,
    }
  } catch {
    return undefined
  }
}
