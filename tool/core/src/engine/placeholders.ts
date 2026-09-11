import type { StepContext } from '../tasks/context'

/**
 * Task-level facts are collected once in the sidebar at task start and are
 * readable by every workflow, so no step has to ask for them again.
 * See spec Section 6.
 */
export function resolveValue(ns: string, field: string, ctx: StepContext): unknown {
  if (ns === 'task') {
    switch (field) {
      case 'platform':
        return ctx.platform.id
      case 'epic':
        return ctx.epic
      case 'dir':
        return ctx.taskDir
      case 'id':
        return ctx.taskId
      default:
        return ctx.inputs[field]
    }
  }
  return ctx.answersOf(ns)[field]
}

/** Renders a value for inclusion in text. Arrays read as a list, not as JSON. */
export function renderValue(v: unknown): string {
  if (Array.isArray(v)) return v.join(', ')
  return String(v ?? '')
}

export function resolveText(text: string, ctx: StepContext): string {
  return text.replace(
    /\{\{([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\}\}/g,
    (_full, ns: string, field: string) => renderValue(resolveValue(ns, field, ctx)),
  )
}

const PLACEHOLDER = /\{\{([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\}\}/g

/** Fields the `task` namespace answers from somewhere other than `inputs`. */
const TASK_INTRINSICS = ['platform', 'epic', 'dir', 'id']

/**
 * Placeholders in `text` that name something this run does not have.
 *
 * `resolveText` substitutes the empty string for anything it cannot resolve, so
 * a typo produces a quietly incomplete prompt rather than a failure. Spec
 * Section 8 called that "a known regret"; this is the guard.
 *
 * What it reports, and why only this much:
 *
 * - **An unknown namespace** — anything that is neither `task` nor a step in
 *   this workflow. Always a mistake, never a matter of timing.
 * - **An unknown `task` field** — the inputs are all set before the workflow
 *   begins, so a name that is not among them is always a mistake too.
 * - **A field missing from a step that has answered.** A step with answers has
 *   submitted, and submission carries every field it declared — including the
 *   ones left blank. So a key that is absent from a non-empty answers object is
 *   a misspelling.
 *
 * What it deliberately does not report: a field on a step with *no* answers yet.
 * The descriptor composes every handoff on every render, including while an
 * earlier step is still being filled in, and "not answered yet" is
 * indistinguishable from "misspelled" at that moment. Flagging it would put a
 * warning on a correct template for as long as the developer was typing.
 */
export function unresolvedIn(text: string, ctx: StepContext): string[] {
  const found = new Set<string>()

  for (const [, ns, field] of text.matchAll(PLACEHOLDER)) {
    const namespace = ns!
    const name = field!

    if (namespace === 'task') {
      if (!TASK_INTRINSICS.includes(name) && !(name in ctx.inputs)) {
        found.add(`task.${name}`)
      }
      continue
    }

    if (!ctx.order.includes(namespace)) {
      found.add(`${namespace}.${name}`)
      continue
    }

    const answers = ctx.answersOf(namespace)
    if (Object.keys(answers).length > 0 && !(name in answers)) {
      found.add(`${namespace}.${name}`)
    }
  }

  return [...found]
}

/** A placeholder used on its own, where the raw value matters (e.g. a list). */
export function resolveList(expr: string, ctx: StepContext): string[] {
  const m = /^\{\{([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\}\}$/.exec(expr.trim())
  if (!m) return []
  const value = resolveValue(m[1]!, m[2]!, ctx)
  return Array.isArray(value) ? value.map(String) : []
}
