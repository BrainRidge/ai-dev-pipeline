import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * The breadcrumb that makes resumption work. The generated .code-workspace
 * declares which task it belongs to, so resuming needs no global registry and
 * nothing that can drift out of sync. See spec Section 7.
 */
export function taskIdFromWorkspaceSettings(
  settings: Record<string, unknown>,
): string | undefined {
  const v = settings['aiDevWorkflow.taskId']
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

export function resolveTasksRoot(configured: string | undefined): string {
  return configured && configured.length > 0
    ? configured
    : join(homedir(), 'ai-dev-workflow', 'tasks')
}

export function resolveCodeRoot(configured: string | undefined): string {
  return configured && configured.length > 0
    ? configured
    : join(homedir(), 'ai-dev-workflow', 'code')
}
