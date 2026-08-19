import type { CommandBlock, StepContext } from './context'

/**
 * Where a planned command goes when the developer asks for it. Keeping this an
 * interface is what lets the planning be tested without a clipboard or a
 * terminal, and it is the same shape of seam as Handoff.
 */
export interface CommandSink {
  copy(text: string): Promise<void>
  /**
   * Pastes at the terminal prompt WITHOUT running it. The developer presses
   * Enter. Anything that touches their real repositories should be their
   * deliberate act, not a side effect of clicking a button in a panel.
   */
  toTerminal(text: string): Promise<void>
}

export type CommandMode = 'copy' | 'terminal'

/** What TaskSession needs from a step that offers commands to run by hand. */
export interface CommandPlanner {
  plan(ctx: StepContext): CommandBlock[]
  deliver(
    blockId: string,
    mode: CommandMode,
    ctx: StepContext,
  ): Promise<{ label: string; text: string }>
}
