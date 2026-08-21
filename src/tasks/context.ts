import type { FieldDef, Microservice, PlatformDef } from '../engine/schema'

export type Answers = Record<string, unknown>

export interface ActionDef {
  id: string
  label: string
  primary?: boolean
}

export interface RenderField extends FieldDef {
  options?: { value: string; label: string }[]
}

/** A copyable block of text the developer acts on by hand: commands, a prompt. */
export interface CommandBlock {
  id: string
  label: string
  /**
   * A caption under the label. Used to show which prompt template composed the
   * block, so a fallback to the bundled default is visible rather than silent.
   * See spec Section 16.
   */
  note?: string
  lines: string[]
  /**
   * The developer may rewrite the block before acting on it. Whatever is in the
   * box travels back with every action from the step, so what is sent is what
   * they can see.
   */
  editable?: boolean
  /** Defaults to Copy and Send to terminal when absent. */
  actions?: ActionDef[]
}

export interface ValidationResult {
  ok: boolean
  errors: Record<string, string>
}

/**
 * Everything a taskType is allowed to know about the run it is part of. It is
 * deliberately a value, not the engine: a taskType can read task-level facts
 * and what earlier steps produced, but cannot drive the traversal.
 */
export interface StepContext {
  /** Recorded context only — it does not filter the microservice catalogue. */
  platform: PlatformDef
  /** The whole catalogue; a task maps the selected shortCodes onto it. */
  microservices: Microservice[]
  taskDir: string
  epic: string
  taskId: string
  workflowId: string
  /** Collected once in the sidebar at task start; readable by every workflow. */
  inputs: Answers
  /** Step ids in nextStep order, so a task can look behind itself. */
  order: string[]
  answersOf(stepId: string): Answers
  resultOf(stepId: string): Record<string, unknown>
}
