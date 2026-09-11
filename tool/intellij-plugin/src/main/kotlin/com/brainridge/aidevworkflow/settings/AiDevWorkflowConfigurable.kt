package com.brainridge.aidevworkflow.settings

import com.intellij.openapi.options.Configurable
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.util.ui.FormBuilder
import javax.swing.JComponent
import javax.swing.JPanel

/**
 * The Settings page. One field per setting the VS Code extension declares, in
 * the same order, with the same wording — a team that has configured one IDE
 * should be able to configure the other without rereading the README.
 * See spec Sections 16 and 19.
 */
class AiDevWorkflowConfigurable : Configurable {

  private val contentRoot = TextFieldWithBrowseButton()
  private val microserviceConfig = TextFieldWithBrowseButton()
  private val platformConfig = TextFieldWithBrowseButton()
  private val customPrompts = TextFieldWithBrowseButton()
  private val toolsConfig = TextFieldWithBrowseButton()
  private val tasksRoot = TextFieldWithBrowseButton()
  private val codeRoot = TextFieldWithBrowseButton()
  private val updateManifestUrl = TextFieldWithBrowseButton()

  private var panel: JPanel? = null

  override fun getDisplayName(): String = "AI Dev Workflow"

  override fun createComponent(): JComponent {
    val built = FormBuilder.createFormBuilder()
      .addLabeledComponent("Content root:", contentRoot)
      .addComponent(hint("Folder holding your team's config/ and prompts/. Fills in the four below."))
      .addLabeledComponent("Microservice config:", microserviceConfig)
      .addComponent(hint("Required for real work. Without it the bundled sample is used."))
      .addLabeledComponent("Platform config:", platformConfig)
      .addComponent(hint("Required for real work. Without it the four sample platforms are used."))
      .addLabeledComponent("Custom prompts:", customPrompts)
      .addLabeledComponent("Tools config:", toolsConfig)
      .addLabeledComponent("Tasks root:", tasksRoot)
      .addComponent(hint("Where task folders are created. Defaults to ~/ai-dev-workflow/tasks."))
      .addLabeledComponent("Code root:", codeRoot)
      .addComponent(hint("Where repositories are cloned. Defaults to ~/ai-dev-workflow/code."))
      .addLabeledComponent("Update manifest URL:", updateManifestUrl)
      .addComponentFillVertically(JPanel(), 0)
      .panel
    panel = built
    reset()
    return built
  }

  private fun hint(text: String) = com.intellij.ui.components.JBLabel(text).apply {
    componentStyle = com.intellij.ui.components.JBLabel.FontColor.BRIGHTER.let {
      com.intellij.util.ui.UIUtil.ComponentStyle.SMALL
    }
  }

  private fun state() = AiDevWorkflowSettings.getInstance().state

  override fun isModified(): Boolean = with(state()) {
    contentRoot.text != this.contentRoot ||
      microserviceConfig.text != this.microserviceConfig ||
      platformConfig.text != this.platformConfig ||
      customPrompts.text != this.customPrompts ||
      toolsConfig.text != this.toolsConfig ||
      tasksRoot.text != this.tasksRoot ||
      codeRoot.text != this.codeRoot ||
      updateManifestUrl.text != this.updateManifestUrl
  }

  override fun apply() {
    with(state()) {
      this.contentRoot = this@AiDevWorkflowConfigurable.contentRoot.text
      this.microserviceConfig = this@AiDevWorkflowConfigurable.microserviceConfig.text
      this.platformConfig = this@AiDevWorkflowConfigurable.platformConfig.text
      this.customPrompts = this@AiDevWorkflowConfigurable.customPrompts.text
      this.toolsConfig = this@AiDevWorkflowConfigurable.toolsConfig.text
      this.tasksRoot = this@AiDevWorkflowConfigurable.tasksRoot.text
      this.codeRoot = this@AiDevWorkflowConfigurable.codeRoot.text
      this.updateManifestUrl = this@AiDevWorkflowConfigurable.updateManifestUrl.text
    }
  }

  override fun reset() {
    with(state()) {
      this@AiDevWorkflowConfigurable.contentRoot.text = this.contentRoot
      this@AiDevWorkflowConfigurable.microserviceConfig.text = this.microserviceConfig
      this@AiDevWorkflowConfigurable.platformConfig.text = this.platformConfig
      this@AiDevWorkflowConfigurable.customPrompts.text = this.customPrompts
      this@AiDevWorkflowConfigurable.toolsConfig.text = this.toolsConfig
      this@AiDevWorkflowConfigurable.tasksRoot.text = this.tasksRoot
      this@AiDevWorkflowConfigurable.codeRoot.text = this.codeRoot
      this@AiDevWorkflowConfigurable.updateManifestUrl.text = this.updateManifestUrl
    }
  }

  override fun disposeUIResources() {
    panel = null
  }
}
