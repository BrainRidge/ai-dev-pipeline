import { PROTOCOL_VERSION } from '../engine/StepDescriptor'
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
