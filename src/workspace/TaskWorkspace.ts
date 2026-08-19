import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildTaskId } from '../engine/taskId'

export interface CreateOpts {
  tasksRoot: string
  epic: string
  workflowId: string
  platform: string
  workflowJson: string
  now?: Date
}

export class TaskWorkspace {
  private constructor(
    readonly dir: string,
    readonly taskId: string,
  ) {}

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
    // extension updates mid-flight. See spec D8.
    await writeFile(join(dir, '.engine', 'workflow.json'), opts.workflowJson, 'utf8')
    return new TaskWorkspace(dir, taskId)
  }

  static async open(dir: string, taskId: string): Promise<TaskWorkspace> {
    return new TaskWorkspace(dir, taskId)
  }

  async snapshotJson(): Promise<string> {
    return readFile(join(this.dir, '.engine', 'workflow.json'), 'utf8')
  }

  async hashOfSnapshot(): Promise<string> {
    return createHash('sha256').update(await this.snapshotJson()).digest('hex')
  }

  /**
   * Detection, not prevention — every developer has full filesystem access, so
   * prevention is not achievable. The goal is that deviation from the standard
   * process is visible in the audit trail. See spec Section 7.
   */
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
