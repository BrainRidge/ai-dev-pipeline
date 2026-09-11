package com.brainridge.aidevworkflow.settings

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

/**
 * The same settings the VS Code extension declares in `contributes.configuration`,
 * stored the JetBrains way.
 *
 * The property names are identical on both sides on purpose: they are what
 * `npm run check:parity` compares, and a team that configures one IDE should
 * recognise every field in the other. See spec Sections 16 and 19.
 */
@State(
  name = "AiDevWorkflowSettings",
  storages = [Storage("aiDevWorkflow.xml")],
)
class AiDevWorkflowSettings : PersistentStateComponent<AiDevWorkflowSettings.State> {

  data class State(
    /** Folder holding the team's `config/` and `prompts/`. Fills in the four below. */
    var contentRoot: String = "",
    /** Required for real work: the microservice catalogue. */
    var microserviceConfig: String = "",
    /** Required for real work: the platform list. */
    var platformConfig: String = "",
    /** Optional override folder of prompt templates, `<workflowId>/<stepId>.md`. */
    var customPrompts: String = "",
    /** Optional tool list for the System Check step. */
    var toolsConfig: String = "",
    /** Where task folders are created. Defaults to ~/ai-dev-workflow/tasks. */
    var tasksRoot: String = "",
    /** Where repositories are cloned. Defaults to ~/ai-dev-workflow/code. */
    var codeRoot: String = "",
    /** URL of a JSON manifest stating the latest published version. */
    var updateManifestUrl: String = "",
    /** Set automatically in generated project files. Do not edit. */
    var taskId: String = "",
  )

  private var state = State()

  override fun getState(): State = state

  override fun loadState(state: State) {
    this.state = state
  }

  companion object {
    fun getInstance(): AiDevWorkflowSettings =
      ApplicationManager.getApplication().getService(AiDevWorkflowSettings::class.java)
  }
}
