import { PROTOCOL_VERSION } from '../engine/StepDescriptor'
import type { ActionDef, Answers, RenderField } from '../tasks/context'

/** The sidebar is a single form, not a workflow, so it has its own shape. */
export interface SetupDescriptor {
  protocolVersion: number
  task: { id: string; platform: string; epic: string; workflowLabel: string }
  progress: { index: number; total: number; steps: never[] }
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
export function unconfiguredDescriptor(message: string): SetupDescriptor {
  return {
    protocolVersion: PROTOCOL_VERSION,
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
