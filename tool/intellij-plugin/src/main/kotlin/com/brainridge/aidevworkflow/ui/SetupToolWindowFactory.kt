package com.brainridge.aidevworkflow.ui

import com.brainridge.aidevworkflow.sidecar.SetupSession
import com.intellij.openapi.Disposable
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
    // The pane draws nothing on its own: the renderer announces itself and
    // waits for a descriptor, which the session fetches from the engine. Until
    // this was wired the tool window was simply blank. See spec Section 19.
    val session = SetupSession(project, panel)

    val content = ContentFactory.getInstance().createContent(panel.component, "Task SetUp", false)
    content.setDisposer(
      Disposable {
        session.dispose()
        panel.dispose()
      },
    )
    toolWindow.contentManager.addContent(content)

    session.start()
  }

  override fun shouldBeAvailable(project: Project): Boolean = true
}
