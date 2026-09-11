package com.brainridge.aidevworkflow.sidecar

import com.intellij.ide.CopyPasteManager
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import org.jetbrains.plugins.terminal.TerminalToolWindowManager
import java.awt.datatransfer.StringSelection

/**
 * The IntelliJ implementation of core's `HostPort`.
 *
 * Every member here answers a member of the TypeScript interface in
 * `tool/core/src/host/HostPort.ts`, and `npm run check:parity` fails if the two
 * ever disagree. That check is the only thing standing between this file and
 * the drift a second plugin invites, so keep the names identical even where
 * Kotlin would prefer otherwise. See spec Section 19.
 */
class IntellijHost(private val project: Project) {

  /** `sink.copy` — see CommandSink. */
  fun copy(text: String) {
    CopyPasteManager.getInstance().setContents(StringSelection(text))
  }

  /**
   * `sink.toTerminal` — pastes at the prompt and stops, exactly as the VS Code
   * host does. The developer presses Enter; nothing runs because a panel button
   * was clicked.
   */
  fun toTerminal(text: String) {
    val widget = TerminalToolWindowManager.getInstance(project)
      .terminalWidgets
      .firstOrNull { it.terminalTitle.defaultTitle == TERMINAL }
      ?: TerminalToolWindowManager.getInstance(project).createShellWidget(null, TERMINAL, true, true)
    widget.sendCommandToExecute(text)
  }

  /**
   * `environment.setting` — VS Code answers this from its settings store, which
   * is how the Tool Check step knows whether agent mode is on. JetBrains has no
   * equivalent registry of assistant settings, so this reports "unknown" and
   * the step says so rather than claiming a check it did not make.
   * See spec Section 17.
   */
  fun setting(@Suppress("UNUSED_PARAMETER") id: String): Boolean? = null

  /** `environment.commands` — no third-party command registry to enumerate. */
  fun commands(): List<String> = emptyList()

  /**
   * `openInEditor` — opens the artifact without stealing focus, so the panel
   * keeps the focus the developer is about to press a button with.
   * See spec Section 9.
   */
  fun openInEditor(path: String) {
    val file = LocalFileSystem.getInstance().refreshAndFindFileByPath(path) ?: return
    ApplicationManager.getApplication().invokeLater {
      FileEditorManager.getInstance(project).openFile(file, /* focusEditor = */ false)
    }
  }

  /** `editorVersion` — compared against `skills.minimumVersion`, which is null here. */
  fun editorVersion(): String = ApplicationInfo.getInstance().fullVersion

  /**
   * `skills` — null, because JetBrains has no Agent Skills folder. The Tool
   * Check step reports the skills check as unsupported rather than silently
   * installing nothing. See spec Section 18.
   */
  fun skills(): Nothing? = null

  companion object {
    private const val TERMINAL = "AI Dev Workflow"
  }
}
