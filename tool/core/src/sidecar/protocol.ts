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
  event: 'progress' | 'error' | 'render'
  payload: unknown
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
}
