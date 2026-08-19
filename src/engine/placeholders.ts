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

/** A placeholder used on its own, where the raw value matters (e.g. a list). */
export function resolveList(expr: string, ctx: StepContext): string[] {
  const m = /^\{\{([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\}\}$/.exec(expr.trim())
  if (!m) return []
  const value = resolveValue(m[1]!, m[2]!, ctx)
  return Array.isArray(value) ? value.map(String) : []
}
