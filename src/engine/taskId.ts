/**
 * Task ids are used as folder names, workspace filenames and audit keys,
 * so they must be filesystem-safe. See spec Section 7.
 */
export function sanitiseEpic(epic: string): string {
  return epic.replace(/[^A-Za-z0-9._-]/g, '-')
}

export function buildTaskId(epic: string, workflowId: string, date: Date, counter: number): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const nn = String(counter).padStart(2, '0')
  return `${sanitiseEpic(epic)}-${workflowId}-${y}${m}${d}-${nn}`
}
