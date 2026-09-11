package com.brainridge.aidevworkflow.sidecar

import com.brainridge.aidevworkflow.settings.AiDevWorkflowConfigurable
import com.brainridge.aidevworkflow.settings.AiDevWorkflowSettings
import com.brainridge.aidevworkflow.ui.RendererPanel
import com.google.gson.JsonObject
import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import java.util.concurrent.TimeUnit

/**
 * Pane 1's owner: the panel on one side, the engine on the other.
 *
 * Everything about *what* the form contains is in core — `buildSetupDescriptor`
 * draws it and `createSetupSession` drives it, both of which the VS Code
 * sidebar uses too. What is left here is the part that is genuinely this IDE's:
 * finding a Node, unpacking the bundle, and the two dialogs the engine cannot
 * open. See spec Section 19.
 */
class SetupSession(
  private val project: Project,
  private val panel: RendererPanel,
) : Disposable {

  private var sidecar: Sidecar? = null

  /** Whether a descriptor has ever reached the page. See the `page` branch. */
  private var drew = false

  fun start() {
    val version = pluginVersion()

    val bundled = BundledContent.ensure(version)
    if (bundled == null) {
      LOG.warn("the bundled content could not be unpacked; the pane will say so")
      panel.showError(
        "The bundled workflow engine could not be unpacked from the plugin. " +
          "Reinstalling the plugin should fix it; the IDE log has the detail.",
      )
      return
    }

    val node = when (val found = NodeDiscovery.find()) {
      is NodeDiscovery.Result.Missing -> {
        LOG.warn("no usable node: ${found.message}")
        return panel.showError(found.message)
      }
      is NodeDiscovery.Result.Ok -> found.node
    }
    LOG.info("sidecar on node ${node.version} at ${node.path}")

    val started = runCatching {
      Sidecar(
        node.path,
        BundledContent.sidecarScript(bundled).toString(),
        environment(bundled.toString()),
      ).also { it.start() }
    }.getOrElse {
      LOG.warn("could not start the sidecar", it)
      return panel.showError("The workflow engine could not be started: ${it.message}")
    }
    sidecar = started

    // Everything the sidecar pushes for the page goes straight through; `host`
    // is the only kind this class reads.
    started.onEvent { event, payload ->
      when (event) {
        "page" -> {
          // Logged once, because "the panel is blank" is the report this pane
          // attracts and the answer turns on whether a descriptor ever arrived.
          // A first `page` event proves the whole round trip: the page's own
          // `ready` reached the engine and the engine answered.
          if (!drew) {
            drew = true
            LOG.info("the setup pane drew its first descriptor")
          }
          panel.postRaw(payload)
        }
        "host" -> onHostAction(payload)
        else -> LOG.debug("unhandled sidecar event $event")
      }
    }

    // Anything the page says goes straight in.
    panel.onMessage { message ->
      started.request("message", mapOf("message" to message)).exceptionally { err ->
        LOG.warn("forwarding to the sidecar failed", err)
        null
      }
    }

    // The handshake refuses a plugin and a bundle that disagree, rather than
    // failing later and further away.
    started
      .request("hello", mapOf("hostVersion" to version))
      .orTimeout(20, TimeUnit.SECONDS)
      .whenComplete { result, err ->
        if (err != null) {
          LOG.warn("the sidecar handshake failed", err)
          panel.showError("The workflow engine did not start: ${err.message}")
          return@whenComplete
        }
        val core = result?.get("coreVersion")?.asString
        if (core != null && core != version) {
          panel.showError(
            "This plugin is $version but its bundled engine is $core. " +
              "Reinstall the plugin — the two ship together.",
          )
          return@whenComplete
        }
        started.request("setupReady", mapOf("version" to "AI Dev Workflow $version"))
      }
  }

  /**
   * The two actions the engine cannot take, and the one write it must not make.
   *
   * A folder picker and the settings dialog are IDE windows; remembering the
   * work directory is a write to this IDE's own settings store.
   */
  private fun onHostAction(payload: JsonObject) {
    when (payload.get("action")?.asString) {
      "browse" -> browse(payload.get("value")?.asString.orEmpty())
      "openSettings" -> ApplicationManager.getApplication().invokeLater {
        ShowSettingsUtil.getInstance().showSettingsDialog(project, AiDevWorkflowConfigurable::class.java)
      }
      "persistCodeRoot" -> payload.get("value")?.asString?.let {
        AiDevWorkflowSettings.getInstance().state.codeRoot = it
      }
      else -> LOG.debug("unknown host action in $payload")
    }
  }

  /** Paths are long and a typo clones somewhere silently wrong. */
  private fun browse(current: String) {
    ApplicationManager.getApplication().invokeLater {
      val descriptor = FileChooserDescriptorFactory.createSingleFolderDescriptor()
        .withTitle("Work Directory")
        .withDescription("Where repositories are cloned")
      // Opened where the field already points, so Browse is a correction
      // rather than a fresh hunt through the filesystem.
      val from = current.takeIf { it.isNotEmpty() }
        ?.let { LocalFileSystem.getInstance().findFileByPath(it) }
      val chosen = FileChooser.chooseFile(descriptor, project, from) ?: return@invokeLater
      // Folded back in as a values update, the same path a typed field takes.
      sidecar?.request(
        "message",
        mapOf(
          "message" to mapOf(
            "type" to "action",
            "stepId" to "setup",
            "actionId" to "refresh",
            "values" to mapOf("workDir" to chosen.path),
          ),
        ),
      )
    }
  }

  /**
   * The eight variables core's sidecar reads. Resolution — the sample fallback,
   * the tasks-root default — happens in core, so this only passes strings.
   */
  private fun environment(bundled: String): Map<String, String> {
    val s = AiDevWorkflowSettings.getInstance().state
    return mapOf(
      "AI_DEV_BUNDLED_DIR" to bundled,
      "AI_DEV_CONTENT_ROOT" to s.contentRoot,
      "AI_DEV_MICROSERVICE_CONFIG" to s.microserviceConfig,
      "AI_DEV_PLATFORM_CONFIG" to s.platformConfig,
      "AI_DEV_CUSTOM_PROMPTS" to s.customPrompts,
      "AI_DEV_TOOLS_CONFIG" to s.toolsConfig,
      "AI_DEV_TASKS_ROOT" to s.tasksRoot,
      "AI_DEV_CODE_ROOT" to s.codeRoot,
      "AI_DEV_IDE_VERSION" to IntellijHost(project).editorVersion(),
    )
  }

  private fun pluginVersion(): String =
    PluginManagerCore.getPlugin(PluginId.getId(PLUGIN_ID))?.version ?: "0.0.0"

  override fun dispose() {
    sidecar?.close()
    sidecar = null
  }

  private companion object {
    const val PLUGIN_ID = "com.brainridge.ai-dev-workflow"
    val LOG = logger<SetupSession>()
  }
}
