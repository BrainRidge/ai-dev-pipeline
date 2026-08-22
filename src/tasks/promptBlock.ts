import type { StepDef } from '../engine/schema'
import type { ComposedPrompt, PromptComposer } from '../prompt/PromptComposer'
import type { Answers, CommandBlock, StepContext } from './context'
import { sourceLabel, templateNote } from '../content/ContentRoot'
import { reposBefore } from './history'

/**
 * The caption above the composed prompt: every file that shaped it, and whose
 * each one was.
 *
 * One line per kind rather than one per file, because the common case is a
 * template and nothing else and the caption must not shout. A reference that is
 * not on disk is named as missing here — the `#file:` is still in the prompt,
 * so the panel is the only place that discrepancy can be seen.
 * See spec Sections 8 and 16.
 */
export function provenanceNote(composed: ComposedPrompt): string {
  const lines = [
    templateNote({ path: composed.templatePath, source: composed.templateSource }),
  ]

  if (composed.includes.length > 0) {
    lines.push(
      `Includes: ${composed.includes
        .map((i) => `${i.path} (${sourceLabel(i.source)})`)
        .join('; ')}`,
    )
  }

  if (composed.references.length > 0) {
    lines.push(
      `References: ${composed.references
        .map((r) => (r.found ? r.path : `${r.path} (not found)`))
        .join('; ')}`,
    )
  }

  // Last, so it is the line closest to the prompt it is about. Not a blocking
  // error: the prompt is on screen and editable, so the developer can fix the
  // wording by hand and get on with their task while the template is corrected
  // by whoever owns it. Blocking a whole team on one typo would be worse than
  // the typo. See spec Section 8.
  if (composed.unresolved.length > 0) {
    lines.push(
      `⚠ Nothing to put in: ${composed.unresolved.map((u) => `{{${u}}}`).join(', ')} — ` +
        `these rendered as nothing. Check the template for a misspelling.`,
    )
  }

  return lines.join('\n')
}

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
  try {
    // An override replaces the text but not the provenance: the caption still
    // reports which template this step would compose from.
    if (override !== undefined) {
      const note = templateNote(await composer.resolved(step, ctx))
      return { block: promptBlock(override, true, note) }
    }

    const composed = await composer.compose(step, ctx, reposBefore(ctx, step.id))
    return { block: promptBlock(composed.prompt, false, provenanceNote(composed)) }
  } catch (err) {
    return { failure: err instanceof Error ? err.message : String(err) }
  }
}

function promptBlock(text: string, edited: boolean, note: string): CommandBlock {
  return {
    id: PROMPT_BLOCK_ID,
    label: edited ? 'Composed prompt (edited)' : 'Composed prompt',
    note,
    lines: text.split('\n'),
    editable: true,
    actions: [
      { id: 'copy', label: 'Copy' },
      { id: 'send', label: 'Send to Copilot' },
      ...(edited ? [{ id: 'reset', label: 'Reset' }] : []),
    ],
  }
}
