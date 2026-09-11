/**
 * The sidecar entry point: the shared engine, driven over stdio.
 *
 * This process holds no UI and no IDE knowledge. It is the same
 * `WorkflowEngine`, the same `TaskTypeRegistry` and the same
 * `buildWorkflowDescriptor` the VS Code extension calls in-process — reached
 * down a pipe instead. That is the whole trick that lets one engine serve two
 * IDEs. See spec Section 19.
 *
 * stdout carries protocol and nothing else. Anything that wants to log goes to
 * stderr, because a stray `console.log` here corrupts the stream and the host
 * sees a parse error rather than the message somebody meant to print.
 */
import { createInterface } from 'node:readline'
import { PROTOCOL_VERSION } from '../engine/StepDescriptor'
import { listUnfinishedTasks } from '../session/taskIndex'
import type { SidecarEvent, SidecarRequest, SidecarResponse } from './protocol'
import { createSession, type SidecarSession } from './session'
import { createSetupSession, type SetupSession } from './setupSession'

const CORE_VERSION = process.env.AI_DEV_CORE_VERSION ?? '0.0.0-dev'

function send(message: SidecarResponse | SidecarEvent): void {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function log(message: string): void {
  process.stderr.write(`[sidecar] ${message}\n`)
}

async function main(): Promise<void> {
  const sessions = new Map<string, SidecarSession>()
  // Pane 1. One per process: the tool window is a singleton in both IDEs.
  let setup: SetupSession | undefined

  const session = async (taskId: string): Promise<SidecarSession> => {
    const existing = sessions.get(taskId)
    if (existing) return existing
    const created = await createSession(taskId, (event) => send(event))
    sessions.set(taskId, created)
    return created
  }

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })

  for await (const line of rl) {
    if (!line.trim()) continue

    let request: SidecarRequest
    try {
      request = JSON.parse(line) as SidecarRequest
    } catch {
      // No id to answer with, so this can only be reported, not returned.
      log(`unparseable request: ${line.slice(0, 200)}`)
      continue
    }

    try {
      send({
        id: request.id,
        ok: true,
        result: await dispatch(request, session, {
          get: () => setup,
          set: (s) => {
            setup = s
          },
        }),
      })
    } catch (err) {
      send({ id: request.id, ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }
}

async function dispatch(
  request: SidecarRequest,
  session: (taskId: string) => Promise<SidecarSession>,
  setup: { get: () => SetupSession | undefined; set: (s: SetupSession) => void },
): Promise<unknown> {
  const p = request.params as Record<string, string>

  switch (request.method) {
    case 'hello':
      return { coreVersion: CORE_VERSION, protocolVersion: PROTOCOL_VERSION }

    case 'describe':
      return (await session(p.taskId!)).describe()

    case 'submit':
      return (await session(p.taskId!)).submit(
        p.stepId!,
        p.actionId!,
        (request.params as { values?: Record<string, string> }).values ?? {},
      )

    case 'edit':
      return (await session(p.taskId!)).edit(p.stepId!)

    case 'tasks':
      return await listUnfinishedTasks(process.env.AI_DEV_TASKS_ROOT ?? '')

    // Pane 1 pushes rather than answers, so both of these return null and the
    // renders arrive as `page` events. See spec Section 19.
    case 'setupReady':
      setup.set(createSetupSession(p.version ?? '', (event) => send(event)))
      return null

    case 'message': {
      const pane = setup.get()
      if (!pane) throw new Error('setupReady has not been called')
      await pane.handle((request.params as { message?: unknown }).message)
      return null
    }

    default:
      throw new Error(`unknown method "${String(request.method)}"`)
  }
}

main().catch((err) => {
  log(`fatal: ${err instanceof Error ? err.stack : String(err)}`)
  process.exit(1)
})
