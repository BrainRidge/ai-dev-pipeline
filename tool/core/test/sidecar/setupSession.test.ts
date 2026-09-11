import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSetupSession } from '../../src/sidecar/setupSession'
import type { SidecarEvent } from '../../src/sidecar/protocol'

/**
 * Pane 1 over the wire. The renderer is not involved: what is asserted is the
 * `page` events a JVM host would forward to it. See spec Section 19.
 */
const BUNDLED = join(__dirname, '../..')

function collector(): { events: SidecarEvent[]; emit: (e: SidecarEvent) => void } {
  const events: SidecarEvent[] = []
  return { events, emit: (e) => events.push(e) }
}

const pages = (events: SidecarEvent[]): Record<string, unknown>[] =>
  events.filter((e) => e.event === 'page').map((e) => e.payload as Record<string, unknown>)

const renders = (events: SidecarEvent[]): Record<string, unknown>[] =>
  pages(events).filter((p) => p.type === 'render')

const ready = { type: 'ready' }
const action = (actionId: string, values: Record<string, unknown> = {}) => ({
  type: 'action',
  stepId: 'setup',
  actionId,
  values,
})

/**
 * Wait for a condition rather than for a guessed interval.
 *
 * The session renders asynchronously — it reads the catalogue off disk — so a
 * fixed sleep either wastes time or fails under load. Polling makes the tests
 * deterministic.
 */
async function until(what: string, ok: () => boolean): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (ok()) return
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error(`timed out waiting for ${what}`)
}

/** Wait until at least `n` renders have been pushed. */
const renderCount = (events: SidecarEvent[], n: number) => () => renders(events).length >= n

/** A settle point for the assertions that expect *no* render. */
const quiet = (): Promise<void> => new Promise((r) => setTimeout(r, 50))

describe('createSetupSession', () => {
  let saved: NodeJS.ProcessEnv
  let tasks: string

  beforeEach(async () => {
    saved = { ...process.env }
    tasks = await mkdtemp(join(tmpdir(), 'setup-session-'))
    process.env.AI_DEV_BUNDLED_DIR = BUNDLED
    process.env.AI_DEV_TASKS_ROOT = tasks
    process.env.AI_DEV_CODE_ROOT = join(tasks, 'code')
    for (const k of [
      'AI_DEV_CONTENT_ROOT',
      'AI_DEV_MICROSERVICE_CONFIG',
      'AI_DEV_PLATFORM_CONFIG',
      'AI_DEV_CUSTOM_PROMPTS',
      'AI_DEV_TOOLS_CONFIG',
    ]) {
      delete process.env[k]
    }
  })

  afterEach(() => {
    process.env = saved
  })

  it('renders nothing until the page announces itself, then flushes', async () => {
    const { events, emit } = collector()
    const session = createSetupSession('AI Dev Workflow 0.10.0', emit)
    await quiet()
    expect(renders(events)).toHaveLength(0)

    await session.handle(ready)
    await until('the first render', renderCount(events, 1))
    expect(renders(events)).toHaveLength(1)
  })

  it('draws the new-task form, with the sample-catalogue banner', async () => {
    const { events, emit } = collector()
    const session = createSetupSession('AI Dev Workflow 0.10.0', emit)
    await session.handle(ready)
    await until('the first render', renderCount(events, 1))

    const d = renders(events)[0]!.descriptor as {
      notice?: string
      version?: string
      step: { fields: { id: string }[]; actions: { id: string }[] }
      footer?: { actions: { id: string }[] }
    }
    expect(d.step.fields.map((f) => f.id)).toContain('platform')
    expect(d.step.fields.map((f) => f.id)).toContain('services')
    expect(d.step.actions.map((a) => a.id)).toEqual(['start'])
    expect(d.footer?.actions.map((a) => a.id)).toEqual(['browse'])
    expect(d.version).toBe('AI Dev Workflow 0.10.0')
    // Nothing configured falls back to the sample, and says so. Section 16.
    expect(d.notice).toContain('sample catalogue')
  })

  it('switches to the existing-task form and keeps typed values', async () => {
    const { events, emit } = collector()
    const session = createSetupSession('v', emit)
    await session.handle(ready)
    await until('the first render', renderCount(events, 1))
    await session.handle(action('refresh', { epic: 'ABC-1', mode: 'existing' }))
    await until('the render after switching mode', renderCount(events, 2))

    const last = renders(events).at(-1)!.descriptor as {
      step: { title: string; values: Record<string, unknown> }
    }
    expect(last.step.title).toBe('Continue a task')
    expect(last.step.values.epic).toBe('ABC-1')
  })

  it('reports field errors on an incomplete submit, and creates nothing', async () => {
    const { events, emit } = collector()
    const session = createSetupSession('v', emit)
    await session.handle(ready)
    await until('the first render', renderCount(events, 1))
    await session.handle(action('start', { epic: '' }))
    await until('the render carrying errors', renderCount(events, 2))

    const last = renders(events).at(-1)!.descriptor as {
      step: { errors?: Record<string, string> }
    }
    expect(last.step.errors).toBeTruthy()
    expect(Object.keys(last.step.errors!).length).toBeGreaterThan(0)
  })

  it('creates a real task on a valid submit, and says pane 2 is missing', async () => {
    const { events, emit } = collector()
    const session = createSetupSession('v', emit)
    await session.handle(ready)
    await until('the first render', renderCount(events, 1))
    await session.handle(
      action('start', {
        platform: 'canada-assisted',
        epic: 'ABC-1',
        workflowId: 'bugFixWorkflow',
        baseBranch: 'main',
        services: ['ref'],
        workDir: join(tasks, 'code'),
      }),
    )
    await until('the render after the task is created', renderCount(events, 2))

    const last = renders(events).at(-1)!.descriptor as {
      notice?: string
      step: { errors?: Record<string, string> }
    }
    expect(last.step.errors).toBeUndefined()

    // The task is on disk, and resumable by the other IDE.
    const created = (await readdir(tasks)).filter((n) => !n.startsWith('.'))
    expect(created).toHaveLength(1)
    const state = JSON.parse(
      await readFile(join(tasks, created[0]!, '.engine', '_state.json'), 'utf8'),
    ) as { workflowId: string; inputs: { baseBranch: string } }
    expect(state.workflowId).toBe('bugFixWorkflow')
    expect(state.inputs.baseBranch).toBe('main')

    // Honest about the dead end rather than looking like a no-op.
    expect(last.notice).toContain(created[0]!)
    expect(last.notice).toContain('not available in this IDE yet')

    // The work directory is remembered by the host, not by us.
    expect(events.filter((e) => e.event === 'host').map((e) => e.payload)).toContainEqual({
      action: 'persistCodeRoot',
      value: join(tasks, 'code'),
    })
  })

  it('leaves browse and openSettings to the host', async () => {
    const { events, emit } = collector()
    const session = createSetupSession('v', emit)
    await session.handle(ready)
    await until('the first render', renderCount(events, 1))
    await session.handle(action('browse', { workDir: '/tmp/x' }))
    await session.handle(action('openSettings'))
    await until('both host actions', () => events.filter((e) => e.event === 'host').length >= 2)

    const host = events.filter((e) => e.event === 'host').map((e) => e.payload)
    expect(host).toEqual([
      { action: 'browse', value: '/tmp/x' },
      { action: 'openSettings' },
    ])
  })
})
