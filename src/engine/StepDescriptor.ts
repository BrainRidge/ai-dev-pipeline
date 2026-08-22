import { basename } from 'node:path'
import type { StepDef, StepType, WorkflowDef } from './schema'
import type { StepRecord, TaskState } from '../state/TaskStateStore'
import type {
  ActionDef,
  Answers,
  CommandBlock,
  RenderField,
  StepContext,
} from '../tasks/context'
import type { TaskTypeRegistry, TaskView } from '../tasks/TaskType'

/** v2: the descriptor carries the whole workflow, not just the active step. */
export const PROTOCOL_VERSION = 2

export type StepStatus = 'complete' | 'current' | 'pending'
export type StepBadge = 'INPUT' | 'SELECT' | 'COMMAND' | 'COPILOT' | 'REVIEW' | 'SYSTEM'

export interface StepView {
  id: string
  index: number
  title: string
  stepType: StepType
  badge: StepBadge
  status: StepStatus
  /** The workflow author's explanation of the step, straight from the JSON. */
  documentation?: string
  /** One-line recap shown on the node. */
  summary?: string
  /** Full answers, so the detail pane can show a completed step read-only. */
  answers?: { label: string; value: string }[]
  /** Present only on the active step. */
  fields?: RenderField[]
  text?: string
  /** Commands for the developer to run by hand. */
  commands?: CommandBlock[]
  values?: Answers
  errors?: Record<string, string>
  actions?: ActionDef[]
}

export interface WorkflowDescriptor {
  protocolVersion: number
  task: { id: string; platform: string; epic: string; workflowLabel: string }
  activeStepId: string
  steps: StepView[]
}

/**
 * Badges are derived from the step's shape, so workflow authors never declare
 * them. "Input" and "Selection" are the same stepType underneath — what
 * separates them is whether the fields offer a fixed set of choices.
 */
export function badgeFor(step: StepDef, fields: RenderField[] | undefined): StepBadge {
  switch (step.stepType) {
    case 'commandExecution':
      return 'COMMAND'
    case 'aiHandoff':
      return 'COPILOT'
    case 'manual':
      return 'REVIEW'
    case 'systemCheck':
      return 'SYSTEM'
    default: {
      const offered = fields ?? []
      const choosy = offered.filter((f) => f.type === 'select' || f.type === 'multiselect')
      return choosy.length > 0 && choosy.length >= offered.length / 2 ? 'SELECT' : 'INPUT'
    }
  }
}

export function summarise(
  step: StepDef,
  record: StepRecord | undefined,
  fields: RenderField[] | undefined,
): string | undefined {
  if (!record || record.status !== 'complete') return undefined

  switch (step.stepType) {
    case 'commandExecution': {
      const repos = (record.result?.repos ?? []) as { name: string }[]
      const branch = String(record.result?.branch ?? '')
      return `${repos.length} ${repos.length === 1 ? 'repo' : 'repos'}${branch ? ` on ${branch}` : ''}`
    }
    case 'aiHandoff': {
      const file = artifactName(record.result?.outputPath) ?? 'The output file'
      return record.result?.outputPresent ? `${file} written` : `${file} missing`
    }
    case 'manual': {
      const file = artifactName(record.result?.artifactPath)
      return file ? `${file} approved` : 'Approved'
    }
    case 'systemCheck': {
      const findings = (record.result?.findings ?? []) as { status: string }[]
      if (findings.length === 0) return 'Checked'
      // "checks" rather than "tools": the list now opens with what the editor
      // says about agent mode, which is not a tool. See spec Section 17.
      const ok = findings.filter((f) => f.status === 'ok').length
      return `${ok} of ${findings.length} checks passed`
    }
    default: {
      const answers = record.answers ?? {}
      const parts = (fields ?? [])
        .map((f) => answers[f.id])
        .filter((v) => v !== undefined && v !== null && v !== '')
        .map((v) => (Array.isArray(v) ? v.join(', ') : String(v)))
      const joined = parts.join(' · ')
      if (!joined) return undefined
      return joined.length > 120 ? `${joined.slice(0, 117)}…` : joined
    }
  }
}

/** Label/value pairs for the detail pane. Pre-formatted so the renderer stays dumb. */
export function detailAnswers(
  step: StepDef,
  record: StepRecord | undefined,
  fields: RenderField[] | undefined,
): { label: string; value: string }[] | undefined {
  if (!record || record.status !== 'complete') return undefined

  if (step.stepType === 'commandExecution') {
    const repos = (record.result?.repos ?? []) as { name: string; path: string }[]
    const out = repos.map((r) => ({ label: r.name, value: r.path }))
    const branch = String(record.result?.branch ?? '')
    if (branch) out.unshift({ label: 'Base branch', value: branch })
    return out.length > 0 ? out : undefined
  }

  const answers = record.answers ?? {}
  const pairs = (fields ?? [])
    .map((f) => ({
      label: f.label,
      value: Array.isArray(answers[f.id])
        ? (answers[f.id] as unknown[]).join(', ')
        : String(answers[f.id] ?? ''),
    }))
    .filter((p) => p.value !== '')

  return pairs.length > 0 ? pairs : undefined
}

export async function buildWorkflowDescriptor(args: {
  workflow: WorkflowDef
  state: TaskState
  registry: TaskTypeRegistry
  ctx: StepContext
  values: Answers
  errors: Record<string, string>
}): Promise<WorkflowDescriptor> {
  const { workflow, state, registry, ctx, values, errors } = args
  const activeId = state.currentStepId

  // Every step describes itself, not just the active one: completed steps need
  // their fields to summarise their answers. Order is preserved by Promise.all.
  const steps: StepView[] = await Promise.all(workflow.order.map(async (stepId, i) => {
    const step = workflow.steps[stepId]!
    const task = registry.get(step.taskType)
    const record = state.steps[step.id]
    const status: StepStatus =
      step.id === activeId ? 'current' : record?.status === 'complete' ? 'complete' : 'pending'

    // The active step prefills from what the developer has typed; every other
    // step describes itself against what it already answered.
    const prefill =
      status === 'current' && Object.keys(values).length > 0 ? values : (record?.answers ?? {})
    const view: TaskView = await task.describe(step, ctx, prefill)

    const base: StepView = {
      id: step.id,
      index: i + 1,
      title: task.title,
      stepType: step.stepType,
      badge: badgeFor(step, view.fields),
      status,
      documentation: step.documentation || undefined,
      summary: summarise(step, record, view.fields),
      answers: detailAnswers(step, record, view.fields),
    }

    if (status !== 'current') {
      // A completed step offers Edit — which reactivates it and marks
      // everything after it pending. See spec Section 9.
      if (status === 'complete') base.actions = [{ id: 'edit', label: 'Edit' }]
      return base
    }

    return {
      ...base,
      fields: view.fields,
      text: view.text,
      commands: view.commands,
      values: prefill,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
      actions: view.actions,
    }
  }))

  return {
    protocolVersion: PROTOCOL_VERSION,
    task: {
      id: state.taskId,
      platform: state.platform,
      epic: state.epic,
      workflowLabel: workflow.label,
    },
    activeStepId: activeId,
    steps,
  }
}

function artifactName(path: unknown): string | undefined {
  return typeof path === 'string' && path.length > 0 ? basename(path) : undefined
}
