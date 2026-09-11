import { join } from 'node:path'
import { homedir } from 'node:os'
import { TaskStateStore } from '../state/TaskStateStore'
import { WorkflowCatalog } from '../engine/WorkflowCatalog'
import { WorkflowEngine } from '../engine/WorkflowEngine'
import { buildWorkflowDescriptor } from '../engine/StepDescriptor'
import { buildTaskTypes } from '../tasks/registry'
import type { StepContext } from '../tasks/context'
import type { HostPort } from '../host/HostPort'
import type { SidecarEvent } from './protocol'

/**
 * One task, driven over the wire.
 *
 * The engine, the registry and the descriptor builder are exactly the ones the
 * VS Code extension uses in-process. What differs is only where the answers go
 * afterwards: back down a pipe rather than into a `WebviewBridge`.
 *
 * The `HostPort` here is supplied by the *plugin*, not by this file — a JVM
 * host answers `openInEditor` and the clipboard itself, over the same pipe in
 * the other direction. Until those round-trips are wired, `sidecarHost` below
 * is the honest minimum: it reports what it cannot do rather than pretending.
 * See spec Section 19.
 */
export interface SidecarSession {
  describe(): Promise<unknown>
  submit(stepId: string, actionId: string, values: Record<string, string>): Promise<unknown>
  edit(stepId: string): Promise<unknown>
}

/** Where the plugin told us its content lives. Set by the host on spawn. */
function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback
}

/**
 * The capabilities a JVM host has to answer for itself.
 *
 * Every member here is a round-trip the plugin must serve. They are stubbed as
 * explicit failures rather than no-ops, because a silent no-op in a handoff
 * step looks exactly like a working handoff that delivered nothing.
 */
function sidecarHost(emit: (e: SidecarEvent) => void): HostPort {
  const unimplemented = (what: string) => async (): Promise<never> => {
    emit({ event: 'error', payload: { message: `the host has not wired ${what} yet` } })
    throw new Error(`host capability "${what}" is not wired`)
  }

  return {
    sink: {
      copy: unimplemented('clipboard'),
      toTerminal: unimplemented('terminal'),
    },
    environment: {
      setting: () => undefined,
      commands: async () => [],
    },
    handoff: {
      // B is the honest floor for a JVM host: no third-party plugin can put
      // text into JetBrains Copilot Chat, so the prompt goes to the clipboard
      // and the developer pastes it. See spec Sections 8 and 19.
      deliver: async () => 'B',
    },
    openInEditor: unimplemented('openInEditor'),
    editorVersion: env('AI_DEV_IDE_VERSION', '0.0.0'),
    // JetBrains has no Agent Skills folder, so the Tool Check step reports the
    // skills check as unsupported rather than silently installing nothing.
    skills: undefined,
  }
}

export async function createSession(
  taskId: string,
  emit: (e: SidecarEvent) => void,
): Promise<SidecarSession> {
  const root = env('AI_DEV_TASKS_ROOT', join(homedir(), 'ai-dev-workflow', 'tasks'))
  const bundled = env('AI_DEV_BUNDLED_DIR', process.cwd())
  const taskDir = join(root, taskId)

  const store = new TaskStateStore(taskDir)
  const state = await store.read()

  // The sample catalogue ships beside the workflows, and is what an
  // unconfigured install falls back to — same rule as VS Code. See Section 16.
  const sample = join(bundled, 'examples', 'content-template', 'config')
  const catalog = await WorkflowCatalog.load(join(bundled, 'workflows'), {
    platformConfig: env('AI_DEV_PLATFORM_CONFIG', join(sample, 'platforms.json')),
    microserviceConfig: env('AI_DEV_MICROSERVICE_CONFIG', join(sample, 'microservices.json')),
  })
  const workflow = catalog.get(state.workflowId)

  const registry = buildTaskTypes({
    promptsDir: process.env.AI_DEV_PROMPTS_DIR,
    bundledPromptsDir: join(bundled, 'prompts'),
    toolsConfig: process.env.AI_DEV_TOOLS_CONFIG,
    taskDir,
    codeRoot: env('AI_DEV_CODE_ROOT', join(homedir(), 'ai-dev-workflow', 'code')),
    host: sidecarHost(emit),
    installedSkills: {},
    rememberSkills: async () => {},
  })
  registry.validateWorkflow(workflow.id, workflow.steps)

  // ctx reads live state, so answersOf always reflects the latest transition.
  const holder = { state }
  const ctx: StepContext = {
    platform: catalog.platforms().find((p) => p.id === state.platform) ?? {
      id: state.platform,
      label: state.platform,
    },
    microservices: catalog.microservices(),
    taskDir,
    epic: state.epic,
    taskId: state.taskId,
    workflowId: workflow.id,
    inputs: state.inputs ?? {},
    order: workflow.order,
    answersOf: (id) => holder.state.steps[id]?.answers ?? {},
    resultOf: (id) => holder.state.steps[id]?.result ?? {},
  }

  const engine = new WorkflowEngine(workflow, store, registry, ctx)

  const describe = async (values: Record<string, string> = {}): Promise<unknown> =>
    buildWorkflowDescriptor({
      workflow,
      state: await engine.state(),
      registry,
      ctx,
      values,
      errors: {},
    })

  return {
    describe: () => describe(),
    async submit(stepId, actionId, values) {
      await engine.submit(stepId, actionId, values)
      holder.state = await engine.state()
      return describe(values)
    },
    async edit(stepId) {
      await engine.edit(stepId)
      holder.state = await engine.state()
      return describe()
    },
  }
}
