import { join } from 'node:path'
import { WebviewBridge, type ActionMessage } from '../bridge/WebviewBridge'
import { resolveAll, type ContentSettings, type ResolvedContent } from '../content/ContentRoot'
import { WorkflowCatalog } from '../engine/WorkflowCatalog'
import { createTask } from '../session/createTask'
import { normaliseSetup, validateSetup, type SetupSelection } from '../session/SetupSelection'
import { resolveTasksRoot } from '../session/resume'
import { buildSetupDescriptor, type SetupDescriptor } from '../session/setupDescriptor'
import type { HostAction, SidecarEvent } from './protocol'

/**
 * Pane 1, driven over the wire.
 *
 * The bridge lives here rather than in the plugin so that the `ready`/flush
 * handling in `WebviewBridge` — which its own comments record as the fix for a
 * blank panel — is not written a second time in Kotlin. The host forwards the
 * page's messages in and posts the `page` events back out without reading
 * either. See spec Section 19.
 *
 * Two of the form's actions are not ours to take: a folder picker and the
 * settings dialog are IDE windows. Those leave as `host` events.
 */
export interface SetupSession {
  /** A message from the renderer, verbatim. */
  handle(message: unknown): Promise<void>
}

function env(name: string, fallback = ''): string {
  return process.env[name] ?? fallback
}

/** The five content settings, as this host set them on spawn. */
function contentSettings(): ContentSettings {
  return {
    contentRoot: env('AI_DEV_CONTENT_ROOT'),
    microserviceConfig: env('AI_DEV_MICROSERVICE_CONFIG'),
    platformConfig: env('AI_DEV_PLATFORM_CONFIG'),
    customPrompts: env('AI_DEV_CUSTOM_PROMPTS'),
    toolsConfig: env('AI_DEV_TOOLS_CONFIG'),
  }
}

interface Paths {
  resolved: ResolvedContent
  workflowsDir: string
  tasksRoot: string
  codeRoot: string | undefined
}

function paths(): Paths {
  const bundled = env('AI_DEV_BUNDLED_DIR', process.cwd())
  return {
    // With nothing configured this resolves to the bundled sample rather than
    // refusing, and the form carries the banner that says so. Section 16.
    resolved: resolveAll(contentSettings(), join(bundled, 'examples', 'content-template')),
    workflowsDir: join(bundled, 'workflows'),
    tasksRoot: resolveTasksRoot(env('AI_DEV_TASKS_ROOT') || undefined),
    codeRoot: env('AI_DEV_CODE_ROOT') || undefined,
  }
}

export function createSetupSession(version: string, emit: (e: SidecarEvent) => void): SetupSession {
  let inbound: ((m: { type: string } & ActionMessage) => void) | undefined

  const bridge = new WebviewBridge<SetupDescriptor>({
    post: (message) => emit({ event: 'page', payload: message }),
    onMessage: (handler) => {
      inbound = handler
    },
  })

  const host = (payload: HostAction): void => emit({ event: 'host', payload })

  let values: Record<string, unknown> = {}
  let errors: Record<string, string> = {}
  /** Set after a task is created, because there is no pane 2 to open into. */
  let banner: string | undefined

  const render = async (): Promise<void> => {
    const p = paths()
    const descriptor = await buildSetupDescriptor({ ...p, version, values, errors })
    bridge.render(
      banner
        ? { ...descriptor, notice: [banner, descriptor.notice].filter(Boolean).join(' — ') }
        : descriptor,
    )
  }

  const selection = (): SetupSelection => ({
    platform: String(values.platform ?? ''),
    epic: String(values.epic ?? ''),
    workflowId: String(values.workflowId ?? ''),
    featureStory: String(values.featureStory ?? ''),
    baseBranch: String(values.baseBranch ?? ''),
    workDir: String(values.workDir ?? ''),
    services: Array.isArray(values.services) ? values.services.map(String) : [],
  })

  const start = async (): Promise<void> => {
    const chosen = normaliseSetup(selection())
    errors = validateSetup(chosen)
    if (Object.keys(errors).length > 0) {
      await render()
      return
    }

    // Remembered for next time, by the host — it owns its settings store. The
    // task keeps the value it started with, so changing this later never moves
    // a running task's repositories.
    host({ action: 'persistCodeRoot', value: chosen.workDir })

    const p = paths()
    if (!p.resolved.ok) {
      errors.platform = p.resolved.message
      await render()
      return
    }

    try {
      const catalog = await WorkflowCatalog.load(p.workflowsDir, {
        platformConfig: p.resolved.platformConfig,
        microserviceConfig: p.resolved.microserviceConfig,
      })
      const created = await createTask({
        tasksRoot: p.tasksRoot,
        workflowsDir: p.workflowsDir,
        catalog,
        selection: chosen,
      })
      // The task is real and on disk. There is no workflow pane in this IDE to
      // open it in yet, and a button that appears to do nothing is exactly the
      // failure this pane was built to stop — so say what happened.
      // See spec Section 19.
      banner =
        `Task ${created.taskId} created under ${p.tasksRoot}. ` +
        'The workflow pane is not available in this IDE yet — open the task in ' +
        'VS Code to continue it.'
      values = {}
      errors = {}
    } catch (err) {
      errors.platform = `Could not start task: ${err instanceof Error ? err.message : String(err)}`
    }
    await render()
  }

  const open = async (): Promise<void> => {
    const taskId = String(values.existingTask ?? '').trim()
    if (!taskId) {
      errors.existingTask = 'Select a task to continue'
      await render()
      return
    }
    errors = {}
    banner =
      `Task ${taskId} is saved and resumable. The workflow pane is not ` +
      'available in this IDE yet — open it in VS Code to continue.'
    await render()
  }

  const act = async (actionId: string, incoming: Record<string, unknown>): Promise<void> => {
    // Merged, not replaced: the form only reports the fields it is currently
    // showing, and switching modes must not throw away what has been typed.
    values = { ...values, ...incoming }

    if (actionId === 'refresh') {
      // A different choice is a fresh attempt; errors from the last one would
      // otherwise sit under fields the developer has since moved away from.
      errors = {}
      await render()
      return
    }
    if (actionId === 'browse') {
      host({ action: 'browse', value: String(values.workDir ?? '') })
      return
    }
    if (actionId === 'openSettings') {
      host({ action: 'openSettings' })
      return
    }
    if (actionId === 'open') {
      await open()
      return
    }
    if (actionId === 'start') await start()
  }

  bridge.onAction((m: ActionMessage) => {
    void act(m.actionId, m.values as Record<string, unknown>)
  })

  // Stored now, posted the moment the page announces itself.
  void render()

  return {
    async handle(message: unknown): Promise<void> {
      inbound?.(message as { type: string } & ActionMessage)
    },
  }
}
