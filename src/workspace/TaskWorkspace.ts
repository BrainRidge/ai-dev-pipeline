import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
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

  /**
   * A task folder nobody else is using.
   *
   * The counter is claimed by *creating* the directory rather than by comparing
   * its name against a listing. That distinction is the whole of this method,
   * and it is not a nicety: the listing comparison was case-sensitive and the
   * filesystem underneath it, on macOS and Windows both, is not. An epic typed
   * `epic-001` on Monday and `EPIC-001` on Tuesday produced two ids that looked
   * different to `Array.includes` and named one directory to the disk — so the
   * second task silently adopted the first one's folder, overwrote its
   * `_state.json`, and left two panels writing the same file. What that looks
   * like from the outside is a step that will not advance however often Done is
   * pressed, because the other session keeps putting the old status back.
   *
   * `mkdir` without `recursive` fails with EEXIST if anything is already there,
   * whatever the filesystem thinks two names mean. Asking it is the only way to
   * be right on every platform.
   */
  static async create(opts: CreateOpts): Promise<TaskWorkspace> {
    const now = opts.now ?? new Date()
    await mkdir(opts.tasksRoot, { recursive: true })

    let counter = 1
    let taskId = buildTaskId(opts.epic, opts.workflowId, now, counter)
    let dir = join(opts.tasksRoot, taskId)

    for (;;) {
      try {
        await mkdir(dir)
        break
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
        counter += 1
        if (counter > 99) {
          throw new Error(
            `there are already 99 tasks for ${opts.epic} and ${opts.workflowId} today, under ` +
              `${opts.tasksRoot}. Archive some before starting another.`,
          )
        }
        taskId = buildTaskId(opts.epic, opts.workflowId, now, counter)
        dir = join(opts.tasksRoot, taskId)
      }
    }

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
