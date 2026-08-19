import type { StepDef } from '../engine/schema'
import type { PromptComposer } from '../prompt/PromptComposer'
import type { Answers, CommandBlock, StepContext } from './context'
import { reposBefore } from './history'

export interface PromptPreview {
  block?: CommandBlock
  /** Set instead of `block` when composition failed, with the reason. */
  failure?: string
}

/**
 * The block id under which the composed prompt is shown and edited. The
 * renderer never knows this name — it reports back whatever id it was given.
 */
export const PROMPT_BLOCK_ID = 'prompt'

/**
 * The developer's rewrite of the composed prompt, if they made one.
 *
 * Edits are held in the step's answers rather than in memory, so closing the
 * panel or reloading the window does not silently throw away a rewrite.
 */
export function editedPrompt(values: Answers): string | undefined {
  const edited = values.edited
  if (typeof edited !== 'object' || edited === null) return undefined
  const text = (edited as Record<string, unknown>)[PROMPT_BLOCK_ID]
  return typeof text === 'string' && text.trim() !== '' ? text : undefined
}

/**
 * The prompt as an editable block, so the developer can read exactly what is
 * being sent, change it, and paste it themselves.
 *
 * Reset appears only once there is an edit to undo: a button that restores what
 * is already on screen is noise.
 *
 * Failure is returned rather than thrown on purpose. The descriptor builder
 * describes every step, not just the active one, so a broken template would
 * otherwise take down the rendering of the whole workflow instead of showing
 * the problem on the step that owns it.
 */
export async function composePreview(
  composer: PromptComposer,
  step: StepDef,
  ctx: StepContext,
  override?: string,
): Promise<PromptPreview> {
  if (override !== undefined) return { block: promptBlock(override, true) }

  try {
    const { prompt } = await composer.compose(step, ctx, reposBefore(ctx, step.id))
    return { block: promptBlock(prompt, false) }
  } catch (err) {
    return { failure: err instanceof Error ? err.message : String(err) }
  }
}

function promptBlock(text: string, edited: boolean): CommandBlock {
  return {
    id: PROMPT_BLOCK_ID,
    label: edited ? 'Composed prompt (edited)' : 'Composed prompt',
    lines: text.split('\n'),
    editable: true,
    actions: [
      { id: 'copy', label: 'Copy' },
      { id: 'send', label: 'Send to Copilot' },
      ...(edited ? [{ id: 'reset', label: 'Reset' }] : []),
    ],
  }
}
