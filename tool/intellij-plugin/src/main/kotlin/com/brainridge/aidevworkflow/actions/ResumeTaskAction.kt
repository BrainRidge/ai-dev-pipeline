package com.brainridge.aidevworkflow.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.Messages

/**
 * Continue an unfinished task where it stopped.
 *
 * Mirrors the VS Code command of the same id. Both plugins must offer the same
 * commands; `npm run check:parity` fails if one gains a command the other
 * lacks. See spec Section 19.
 */
class ResumeTaskAction : AnAction() {
  override fun actionPerformed(e: AnActionEvent) {
    val project = e.project ?: return
    // The session shell is the follow-up task: TaskSession's orchestration is
    // still VS Code-only and has to be lifted into core first. See Section 19.
    Messages.showInfoMessage(
      project,
      "Open the AI Dev Pipeline tool window to run a task.",
      "AI Dev Workflow",
    )
  }
}
