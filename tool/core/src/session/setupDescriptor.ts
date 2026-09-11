import { PROTOCOL_VERSION } from '../engine/StepDescriptor'
import { WorkflowCatalog } from '../engine/WorkflowCatalog'
import type { ResolvedContent } from '../content/ContentRoot'
import { resolveCodeRoot } from '../session/resume'
import { listUnfinishedTasks, taskLabel } from '../session/taskIndex'
import { needsFeatureStory } from '../session/SetupSelection'
import type { ActionDef, Answers, RenderField } from '../tasks/context'

/**
 * The banner shown while the bundled sample catalogue is in play.
 *
 * Falling back is only acceptable if it is visible afterwards — the rule
 * [Section 16](16-external-content.md) applies to prompt templates and
 * [Section 17](17-tool-check.md) applies to the tool list. This is the same
 * rule for the catalogue, and it has to be louder than a caption because the
 * consequence is more surprising: a developer who does not notice will select a
 * service that cannot be cloned.
 */
export const SAMPLE_NOTICE =
  '⚠ Using the bundled sample catalogue — placeholder services that cannot be ' +
  "cloned. Set Content Root to your team's folder to work on real repositories."

/** The sidebar is a single form, not a workflow, so it has its own shape. */
export interface SetupDescriptor {
  protocolVersion: number
  task: { id: string; platform: string; epic: string; workflowLabel: string }
  progress: { index: number; total: number; steps: never[] }
  /** A warning above the form. Drawn as given; the renderer adds no wording. */
  notice?: string
  /**
   * Which build this is, shown at the foot of the pane.
   *
   * Distribution is a .vsix installed by hand, so versions drift across a team
   * ([D7](04-decisions.md)) and "which one have you got" is a question somebody
   * asks every time behaviour differs between two developers. Putting it on
   * screen means the answer is in the screenshot they were going to send anyway.
   */
  version?: string
  step: {
    id: string
    kind: string
    title: string
    fields: RenderField[]
    text?: string
    values: Answers
    errors?: Record<string, string>
    actions: ActionDef[]
  }
  /** Machine-level settings, rendered below the primary action. */
  footer?: { title?: string; fields: RenderField[]; actions: ActionDef[] }
}

/**
 * What the sidebar shows when the content root is unset, missing or invalid.
 *
 * Both modes are replaced, not just New. Continuing a task looks as though it
 * should still work, because workflows are bundled — but resuming loads the
 * config directory too, so the action would fail after the developer took it.
 *
 * The message is passed in rather than chosen here: "you have not configured
 * this" and "you have configured this wrongly" need different words, and only
 * the caller knows which happened. See spec Section 16.
 */
export function unconfiguredDescriptor(message: string, version?: string): SetupDescriptor {
  return {
    protocolVersion: PROTOCOL_VERSION,
    version,
    task: { id: '', platform: '', epic: '', workflowLabel: 'Task setup' },
    progress: { index: 0, total: 0, steps: [] },
    step: {
      id: 'setup',
      kind: 'form',
      title: 'Task setup',
      fields: [],
      text: message,
      values: {},
      actions: [{ id: 'openSettings', label: 'Open Settings', primary: true }],
    },
  }
}

/**
 * Everything the setup form needs that only a host can know.
 *
 * The three paths and `codeRoot` come from that IDE's settings store — a
 * `vscode.workspace.getConfiguration` on one side, an `AiDevWorkflowSettings`
 * on the other. `values` and `errors` are the form's own accumulated state,
 * held by whoever owns the pane. Nothing here mentions an IDE, which is the
 * point: the same call serves the VS Code sidebar and the JetBrains tool
 * window. See spec Section 19.
 */
export interface SetupInput {
  /** Already resolved by `resolveAll`, so the sample fallback is host-neutral. */
  resolved: ResolvedContent
  /** Where the bundled workflow definitions live in this host's install. */
  workflowsDir: string
  tasksRoot: string
  /** The `codeRoot` setting, unresolved — `resolveCodeRoot` applies the default. */
  codeRoot: string | undefined
  /** The line at the foot of the pane. Composed by the host; see spec Section 9. */
  version: string
  values: Record<string, unknown>
  errors: Record<string, string>
}

/** New starts a task; Existing picks up one already saved under the tasks root. */
type Mode = 'new' | 'existing'

/**
 * The whole setup pane, as one call.
 *
 * Lifted out of the VS Code `SetupView` so a JVM host can reach it. The three
 * outcomes move together — unconfigured, catalogue failure, form — because
 * choosing between them *is* the logic, and splitting them would leave the
 * choice behind in one host.
 */
export async function buildSetupDescriptor(input: SetupInput): Promise<SetupDescriptor> {
  // Nothing configured resolves to the bundled sample, so this branch is only
  // reached by a path that is configured *wrongly* — relative, missing, or
  // unparseable. See spec Section 16.
  if (!input.resolved.ok) return unconfiguredDescriptor(input.resolved.message, input.version)
  const notice = input.resolved.source === 'sample' ? SAMPLE_NOTICE : undefined

  let catalog: WorkflowCatalog
  try {
    catalog = await WorkflowCatalog.load(input.workflowsDir, {
      platformConfig: input.resolved.platformConfig,
      microserviceConfig: input.resolved.microserviceConfig,
    })
  } catch (err) {
    // A missing file, malformed JSON, a duplicate shortCode. The loader's own
    // wording is the most useful thing here, so it is shown as it comes.
    return unconfiguredDescriptor(err instanceof Error ? err.message : String(err), input.version)
  }

  const modeField: RenderField = {
    id: 'mode',
    type: 'select',
    label: 'Task',
    options: [
      { value: 'new', label: 'New task' },
      { value: 'existing', label: 'Continue an existing task' },
    ],
  }

  const mode: Mode = input.values.mode === 'existing' ? 'existing' : 'new'
  return mode === 'existing'
    ? await existingDescriptor(input, catalog, modeField, notice)
    : newDescriptor(input, catalog, modeField, notice)
}

/**
 * The saved tasks that still have work in them. Finished tasks are left out:
 * this list exists to answer "where was I", and a folder of everything ever
 * started answers nothing. They remain reachable through the Resume Task
 * command.
 */
async function existingDescriptor(
  input: SetupInput,
  catalog: WorkflowCatalog,
  modeField: RenderField,
  notice?: string,
): Promise<SetupDescriptor> {
  const tasks = await listUnfinishedTasks(input.tasksRoot)
  const labelOf = (id: string): string | undefined => catalog.all().find((w) => w.id === id)?.label

  const chosen = String(input.values.existingTask ?? '')
  const selected = tasks.some((t) => t.taskId === chosen) ? chosen : (tasks[0]?.taskId ?? '')

  const fields: RenderField[] = [modeField]
  if (tasks.length > 0) {
    fields.push({
      id: 'existingTask',
      type: 'select',
      label: 'Task to continue',
      options: tasks.map((t) => ({ value: t.taskId, label: taskLabel(t, labelOf(t.workflowId)) })),
    })
  }

  return {
    protocolVersion: PROTOCOL_VERSION,
    task: { id: '', platform: '', epic: '', workflowLabel: 'Task setup' },
    progress: { index: 0, total: 0, steps: [] },
    notice,
    version: input.version,
    step: {
      id: 'setup',
      kind: 'form',
      title: 'Continue a task',
      fields,
      text:
        tasks.length > 0
          ? 'Unfinished tasks, most recent first. Opening one picks it up at the step it stopped on.'
          : 'No unfinished tasks saved yet. Switch to New task to start one.',
      values: { ...input.values, mode: 'existing', existingTask: selected },
      errors: Object.keys(input.errors).length > 0 ? input.errors : undefined,
      actions: tasks.length > 0 ? [{ id: 'open', label: 'Open task', primary: true }] : [],
    },
  }
}

function newDescriptor(
  input: SetupInput,
  catalog: WorkflowCatalog,
  modeField: RenderField,
  notice?: string,
): SetupDescriptor {
  const platforms = catalog.platforms()
  const workflows = catalog.all()
  const selectedPlatform = String(input.values.platform ?? platforms[0]?.id ?? '')
  const selectedWorkflow = String(input.values.workflowId ?? workflows[0]?.id ?? '')

  const fields: RenderField[] = [
    modeField,
    {
      id: 'platform',
      type: 'select',
      label: 'Platform',
      options: platforms.map((p) => ({ value: p.id, label: p.label })),
    },
    { id: 'epic', type: 'text', label: 'Epic', required: true },
    {
      id: 'workflowId',
      type: 'select',
      label: 'Task type',
      options: workflows.map((w) => ({ value: w.id, label: w.label })),
    },
  ]

  if (needsFeatureStory(selectedWorkflow)) {
    fields.push({ id: 'featureStory', type: 'text', label: 'Feature story', required: true })
  }

  fields.push(
    { id: 'baseBranch', type: 'text', label: 'Base branch', required: true },
    // Platform is recorded context, not a filter: the catalogue is one list.
    // The renderer grows a type-to-filter box over it past five options.
    {
      id: 'services',
      type: 'multiselect',
      label: 'Microservices',
      required: true,
      options: catalog
        .microservices()
        .map((s) => ({ value: s.shortCode, label: `${s.microserviceName} (${s.shortCode})` })),
    },
  )

  // Prefilled from the setting, so it is set once and remembered.
  const workDir = String(input.values.workDir ?? resolveCodeRoot(input.codeRoot))

  return {
    protocolVersion: PROTOCOL_VERSION,
    task: { id: '', platform: selectedPlatform, epic: '', workflowLabel: 'Task setup' },
    progress: { index: 0, total: 0, steps: [] },
    notice,
    version: input.version,
    step: {
      id: 'setup',
      kind: 'form',
      title: 'Task setup',
      fields,
      values: {
        ...input.values,
        mode: 'new',
        platform: selectedPlatform,
        workflowId: selectedWorkflow,
        workDir,
      },
      errors: Object.keys(input.errors).length > 0 ? input.errors : undefined,
      // Start task, and nothing beside it. The sample-catalogue banner used to
      // put an Open Settings button here, which made a working form look like
      // it needed attending to — the banner already names Content Root, and the
      // setting is one command palette away. The wall in
      // `unconfiguredDescriptor` keeps its button, because there it is the only
      // way forward.
      actions: [{ id: 'start', label: 'Start task', primary: true }],
    },
    footer: {
      title: 'Work directory',
      fields: [
        { id: 'workDir', type: 'text', label: 'Where repositories are cloned', required: true },
      ],
      actions: [{ id: 'browse', label: 'Browse…' }],
    },
  }
}
