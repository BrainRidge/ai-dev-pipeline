import type { StepDef } from '../engine/schema'
import type { Mechanism } from '../handoff/ChatHandoff'
import type { StepContext } from './context'

export interface Delivery {
  mechanism: Mechanism
  promptChars: number
  /** Absent when the handoff produces edits rather than a document. */
  outputPath?: string
}

/**
 * What the session needs from any step that hands work to Copilot, whatever
 * the step produces. It lets TaskSession drive `send` without asking which
 * concrete task type it is holding.
 */
export interface CopilotHandoff {
  /**
   * Composes, logs and delivers. Finds the repositories in scope itself.
   * `override` is the developer's rewrite of the prompt, sent verbatim in place
   * of the composed one — so the log records what was actually asked.
   */
  deliver(step: StepDef, ctx: StepContext, override?: string): Promise<Delivery>
  /** Puts the prompt — the developer's version, if they have one — on the clipboard. */
  copyPrompt(
    step: StepDef,
    ctx: StepContext,
    override?: string,
  ): Promise<{ label: string; text: string }>
  /** Only a handoff contracted to write a file can answer this. */
  outputPath?(step: StepDef, ctx: StepContext): Promise<string>
  /**
   * Whether that artifact is on disk right now.
   *
   * Asked at the moment the developer presses Done, because spec D9 wants the
   * file to exist — not for a watcher to have happened to see it appear. The
   * watcher is one way of noticing; this is the question itself.
   */
  artifactPresent?(step: StepDef, ctx: StepContext): Promise<boolean>
}
