/**
 * The wire format between a non-VS-Code host and the shared engine.
 *
 * VS Code loads core in-process, so it never speaks this. IntelliJ cannot —
 * the plugin is JVM code and the engine is TypeScript — so it spawns the
 * sidecar and speaks JSON-RPC to it over stdio. The alternative was porting the
 * engine to Kotlin and maintaining two of them. See spec Section 19.
 *
 * One request per line, one response per line, both UTF-8 JSON. Line-delimited
 * rather than Content-Length framed because every message here is small and a
 * developer can read a session off the wire with `tee`.
 */
export interface SidecarRequest {
  id: number
  method: keyof SidecarMethods
  params: unknown
}

export type SidecarResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }

/**
 * A push from the engine that no request asked for — progress while a step
 * runs, or an error banner. Carries no `id`, which is how a host tells it from
 * a response.
 */
export interface SidecarEvent {
  /**
   * `page` is a message destined for the renderer, to be forwarded verbatim.
   *
   * The setup pane's bridge lives here rather than in the JVM, so that the
   * `ready`/flush handling in `WebviewBridge` is not written a second time in
   * Kotlin. That makes the host a pipe: it hands `payload` to the page without
   * reading it. `progress`, `error` and `render` predate that and belong to
   * pane 2, which is not built yet. See spec Section 19.
   */
  event: 'progress' | 'error' | 'render' | 'page' | 'host'
  payload: unknown
}

/**
 * An action the engine cannot take because it is an IDE dialog.
 *
 * Emitted as a `host` event for the plugin to carry out. Two of the setup
 * form's actions are these: a native folder picker and the settings dialog.
 * `persistCodeRoot` is the third — remembering the work directory is a write
 * to that IDE's own settings store.
 */
export interface HostAction {
  action: 'browse' | 'openSettings' | 'persistCodeRoot'
  /** For `browse`, the folder to open at. For `persistCodeRoot`, the value. */
  value?: string
}

/**
 * The methods a host may call. Adding one here is a change both hosts see, so
 * it belongs to core rather than to either plugin.
 */
export interface SidecarMethods {
  /** Handshake. Fails the host fast if the bundle and the plugin disagree. */
  hello: { params: { hostVersion: string }; result: { coreVersion: string; protocolVersion: number } }
  /** The whole workflow, as the renderer wants it. */
  describe: { params: { taskId: string }; result: unknown }
  /** Apply an action from the renderer and return the new descriptor. */
  submit: {
    params: { taskId: string; stepId: string; actionId: string; values: Record<string, string> }
    result: unknown
  }
  /** Reopen a completed step. */
  edit: { params: { taskId: string; stepId: string }; result: unknown }
  /** Unfinished tasks under the tasks root. */
  tasks: { params: Record<string, never>; result: unknown }
  /**
   * Open the setup pane. The host supplies the one thing only it knows — the
   * version line at the foot of the form — and the session takes over from
   * there, pushing `page` events as the bridge decides to.
   */
  setupReady: { params: { version: string }; result: null }
  /**
   * Forward a message from the renderer inward, verbatim.
   *
   * Returns nothing: the answer is not a response but a `page` event, because
   * one message in may produce no render or several. See spec Section 19.
   */
  message: { params: { message: unknown }; result: null }
}
