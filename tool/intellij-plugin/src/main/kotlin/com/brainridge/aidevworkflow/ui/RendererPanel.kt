package com.brainridge.aidevworkflow.ui

import com.google.gson.Gson
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.intellij.ide.ui.LafManagerListener
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.editor.colors.EditorColorsListener
import com.intellij.openapi.project.Project
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefJSQuery
import com.intellij.util.ui.JBUI
import javax.swing.JComponent

/**
 * The shared renderer, in a JCEF browser.
 *
 * This is the IntelliJ half of core's `Transport`: `post` reaches the page by
 * `executeJavaScript`, and the page reaches back through a `JBCefJSQuery`. The
 * renderer bundle, the descriptor it draws and the protocol between them are
 * byte-for-byte the ones VS Code loads. See spec Sections 9 and 19.
 *
 * The page is served from the plugin's own resources rather than a file:// URL
 * so that a JCEF security policy change cannot silently break loading.
 */
class RendererPanel(
  private val project: Project,
  private val pane: Pane,
) : Disposable {

  /**
   * Which renderer bundle this pane draws, and the stylesheet that goes with
   * it. The pairing is core's, not this host's: VS Code loads the same two
   * files for the same two panes. See spec Section 9.
   */
  enum class Pane(val bundle: String, val style: String) {
    /** Pane 1, the task-level form. */
    SETUP("setup.js", "setup.css"),

    /** Pane 2, the whole workflow as a diagram with a detail pane. */
    WORKFLOW("webview.js", "style.css"),
  }

  private val gson = Gson()
  private val browser = JBCefBrowser()
  private val query = JBCefJSQuery.create(browser as com.intellij.ui.jcef.JBCefBrowserBase)

  val component: JComponent
    get() = browser.component.apply { border = JBUI.Borders.empty() }

  init {
    query.addHandler { raw ->
      handle(gson.fromJson(raw, JsonObject::class.java))
      null
    }
    // Painted before the document exists, so switching to this tool window on a
    // dark IDE does not flash a white page.
    browser.setPageBackgroundColor(IdeTheme.pageBackground())
    browser.loadHTML(html())

    // The theme is not read once: Settings | Appearance changes it, and so does
    // the OS when the IDE follows it. Both arrive here, and both only have to
    // replace the one <style> block. See spec Section 19.
    val bus = ApplicationManager.getApplication().messageBus.connect(this)
    bus.subscribe(LafManagerListener.TOPIC, LafManagerListener { reTheme() })
    bus.subscribe(EditorColorsManager.TOPIC, EditorColorsListener { reTheme() })
  }

  /**
   * Re-fill the theme block in the page that is already loaded.
   *
   * Only the variables change; the renderer is not reloaded and the form keeps
   * whatever the developer has typed into it.
   */
  private fun reTheme() {
    val css = gson.toJson(IdeTheme.css())
    browser.setPageBackgroundColor(IdeTheme.pageBackground())
    browser.cefBrowser.executeJavaScript(
      "(() => { const s = document.getElementById('${IdeTheme.STYLE_ID}'); if (s) s.textContent = $css })()",
      browser.cefBrowser.url,
      0,
    )
  }

  /** core's `Transport.post`. */
  fun post(message: Any) {
    val json = gson.toJson(message)
    browser.cefBrowser.executeJavaScript(
      "window.dispatchEvent(new MessageEvent('message', { data: $json }))",
      browser.cefBrowser.url,
      0,
    )
  }

  /**
   * Install the owner of this pane.
   *
   * Everything the page says is forwarded verbatim; this class does not know
   * what a workflow is. The bridge that interprets these lives in the sidecar,
   * so that core's `ready`/flush handling is not written a second time here.
   * See spec Section 19.
   */
  fun onMessage(listener: (JsonObject) -> Unit) {
    listeners += listener
  }

  private fun handle(message: JsonObject) {
    listeners.forEach { it(message) }
  }

  /**
   * A message the page should see, straight from the sidecar.
   *
   * Dispatched onto the EDT because it arrives on the sidecar's reader thread,
   * and the browser is a Swing component.
   */
  fun postRaw(payload: JsonElement) {
    ApplicationManager.getApplication().invokeLater {
      browser.cefBrowser.executeJavaScript(
        "window.dispatchEvent(new MessageEvent('message', { data: $payload }))",
        browser.cefBrowser.url,
        0,
      )
    }
  }

  /**
   * Draw a message of our own, for the failures that happen before the sidecar
   * exists — no Node, an unpacking failure, a handshake mismatch. The renderer
   * already draws `error`; without this the pane would simply stay blank, which
   * is the bug this pane was rebuilt to stop.
   */
  fun showError(message: String) {
    postRaw(gson.toJsonTree(mapOf("type" to "error", "stepId" to "setup", "message" to message)))
  }

  /**
   * The page. The VS Code host writes the equivalent in `vscodeTransport.ts`
   * with a CSP built from `webview.cspSource`; JCEF has no such source, so the
   * policy is written out in full here.
   *
   * The stylesheet is core's, unmodified, and is written against the
   * `--vscode-*` variables a VS Code webview defines for it. Nothing defines
   * them here, so `IdeTheme` does — see it for why the pane was black on black
   * without it.
   */
  private fun html(): String {
    val script = javaClass.getResource("/core/renderer/${pane.bundle}")?.readText().orEmpty()
    val style = javaClass.getResource("/core/renderer/${pane.style}")?.readText().orEmpty()
    return """
      <!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <!-- The IDE's colours first, then the stylesheet that spends them. -->
      <style id="${IdeTheme.STYLE_ID}">${IdeTheme.css()}</style>
      <style>$style</style>
      </head><body><div id="root"></div>
      <script>
        // The renderer posts through vscode.postMessage in both IDEs; here that
        // name is bound to the JCEF query instead. The renderer never knows.
        window.acquireVsCodeApi = () => ({
          postMessage: (m) => { ${query.inject("JSON.stringify(m)")} }
        });
      </script>
      <script>$script</script>
      </body></html>
    """.trimIndent()
  }

  override fun dispose() {
    query.dispose()
    browser.dispose()
  }

  private val listeners = mutableListOf<(JsonObject) -> Unit>()
}
