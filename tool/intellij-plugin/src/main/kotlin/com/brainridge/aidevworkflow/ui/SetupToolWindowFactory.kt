package com.brainridge.aidevworkflow.ui

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory

/**
 * Pane 1: the Task SetUp form, the JetBrains equivalent of the VS Code activity
 * bar view. Hosts the same renderer bundle in a JCEF browser — see
 * `RendererPanel` — so the two IDEs draw the same form from the same descriptor.
 * See spec Sections 9 and 19.
 */
class SetupToolWindowFactory : ToolWindowFactory {
  override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
    val panel = RendererPanel(project, RendererPanel.Pane.SETUP)
    val content = ContentFactory.getInstance().createContent(panel.component, "Task SetUp", false)
    content.setDisposer(panel)
    toolWindow.contentManager.addContent(content)
  }

  override fun shouldBeAvailable(project: Project): Boolean = true
}
