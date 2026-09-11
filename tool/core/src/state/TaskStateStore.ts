import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
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
  /** The version the task started on, so resume rebuilds the same graph (D8). */
  workflowVersion: string
  platform: string
  epic: string
  currentStepId: string
  workflowHash: string
  /** Task-level facts collected in the sidebar before the workflow starts. */
  inputs: Record<string, unknown>
  steps: Record<string, StepRecord>
}

/**
 * Disk is the source of truth. Opening the generated multi-root workspace
 * restarts the extension host mid-workflow, so nothing may live only in
 * memory. See spec Section 7.
 */
export class TaskStateStore {
  private readonly engineDir: string
  private readonly file: string

  constructor(taskDir: string) {
    this.engineDir = join(taskDir, '.engine')
    this.file = join(this.engineDir, '_state.json')
  }

  async exists(): Promise<boolean> {
    try {
      await access(this.file)
      return true
    } catch {
      return false
    }
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
