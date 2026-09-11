/**
 * The task-level facts collected in the sidebar before any workflow begins.
 * Kept free of vscode so the rules can be tested without an extension host.
 */
export interface SetupSelection {
  platform: string
  epic: string
  workflowId: string
  featureStory: string
  baseBranch: string
  /** Where the repositories are cloned and worked on. */
  workDir: string
  services: string[]
}

/**
 * The one workflow that asks for a story key up front.
 *
 * This is a name in TypeScript, which the config-driven design otherwise
 * avoids: a workflow that wants its own sidebar field costs an edit here and a
 * release. That trade was made deliberately — the alternative was letting
 * workflows declare their task inputs in JSON. If a third workflow needs a
 * field of its own, revisit that rather than extending this list.
 */
export const NEW_FEATURE_WORKFLOW_ID = 'newFeatureWorkflow'

/** PLAT-1234 — the same shape as the epic key beside it. */
const JIRA_KEY = /^[A-Za-z][A-Za-z0-9]*-\d+$/

/** Accepts POSIX and Windows roots, since the commands are pasted into a shell. */
export function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')
}

export function needsFeatureStory(workflowId: string): boolean {
  return workflowId === NEW_FEATURE_WORKFLOW_ID
}

/** Field id to message. An empty object means the selection is usable. */
export function validateSetup(selection: SetupSelection): Record<string, string> {
  const errors: Record<string, string> = {}

  if (!selection.platform) errors.platform = 'Select a platform'
  if (!selection.epic.trim()) errors.epic = 'An epic key is required'
  if (!selection.workflowId) errors.workflowId = 'Select a task type'
  if (!selection.baseBranch.trim()) {
    errors.baseBranch = 'A base branch is required'
  }
  if (selection.services.length === 0) {
    errors.services = 'Select at least one microservice'
  }

  const workDir = selection.workDir.trim()
  if (!workDir) {
    errors.workDir = 'A work directory is required'
  } else if (!isAbsolutePath(workDir)) {
    // A relative path would resolve against whatever the terminal's working
    // directory happened to be, which is not something we can predict.
    errors.workDir = 'Enter a full path, such as /Users/you/work'
  }

  if (needsFeatureStory(selection.workflowId)) {
    const story = selection.featureStory.trim()
    if (!story) {
      errors.featureStory = 'A feature story is required'
    } else if (!JIRA_KEY.test(story)) {
      errors.featureStory = 'Enter a story key such as PLAT-1234'
    }
  }

  return errors
}

/** Trimmed and normalised, ready to be written to the task state. */
export function normaliseSetup(selection: SetupSelection): SetupSelection {
  return {
    ...selection,
    epic: selection.epic.trim(),
    baseBranch: selection.baseBranch.trim(),
    workDir: selection.workDir.trim(),
    featureStory: needsFeatureStory(selection.workflowId) ? selection.featureStory.trim() : '',
  }
}
