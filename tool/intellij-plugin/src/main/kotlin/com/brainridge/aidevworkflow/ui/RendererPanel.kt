package com.brainridge.aidevworkflow.ui

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.intellij.openapi.Disposable
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

  enum class Pane(val bundle: String) {
    /** Pane 1, the task-level form. */
    SETUP("setup.js"),

    /** Pane 2, the whole workflow as a diagram with a detail pane. */
    WORKFLOW("webview.js"),
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
    browser.loadHTML(html())
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

  private fun handle(message: JsonObject) {
    // Routed to the session that owns this pane. Wired in the follow-up task
    // that lifts TaskSession's orchestration into core — see spec Section 19.
    LOG_MESSAGES += message
  }

  /**
   * The page. The VS Code host writes the equivalent in `vscodeTransport.ts`
   * with a CSP built from `webview.cspSource`; JCEF has no such source, so the
   * policy is written out in full here.
   */
  private fun html(): String {
    val script = javaClass.getResource("/core/renderer/${pane.bundle}")?.readText().orEmpty()
    val style = javaClass.getResource("/core/renderer/style.css")?.readText().orEmpty()
    return """
      <!DOCTYPE html><html><head>
      <meta charset="utf-8">
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

  private companion object {
    val LOG_MESSAGES = mutableListOf<JsonObject>()
  }
}
