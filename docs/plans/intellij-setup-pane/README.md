# IntelliJ Setup Pane Implementation Plan

**Goal:** Make the IntelliJ plugin's "AI Dev Pipeline" tool window draw the Task
SetUp form and create a task, using the same renderer bundle, the same
descriptor and the same engine as the VS Code sidebar — and leave the VS Code
sidebar behaving exactly as it does today.

**The problem this fixes.** The tool window is blank. `setup.js` ends with
`postMessage({type:'ready'})` and renders nothing until a descriptor arrives;
`RendererPanel.handle()` appends that message to a static list and returns; and
`RendererPanel.post()` — the only path back to the page — is called by nothing.
Underneath that, the sidecar protocol has no method that serves pane 1 at all:
`describe`, `submit` and `edit` all take a `taskId` and load existing state,
while pane 1 is the form that *creates* a task. The logic that builds the setup
descriptor lives in `tool/vscode-plugin/src/session/SetupView.ts`, which imports
`vscode` and cannot be reached from a JVM host.

**Architecture.** The sidecar owns the bridge; the JVM is a pipe.

```
JCEF page  ──JBCefJSQuery──▶ RendererPanel ──stdio──▶ sidecar
(setup.js)  ◀─executeJavaScript─           ◀──event──  WebviewBridge<SetupDescriptor>
```

This is the shape the existing code already anticipates: `SidecarEvent` is
declared with an `event: 'progress' | 'error' | 'render'` union, `Sidecar.onEvent`
is documented as firing for "a `progress`, `error` or `render` push that no
request asked for", and `RendererPanel.post` exists unused. Putting core's
`WebviewBridge` in the sidecar rather than reimplementing it in Kotlin is what
keeps the `ready`/flush handling — which the class's own comments record as
hard-won — in one place instead of two.

So the JVM side gains no protocol logic. It forwards what the page says inward
and posts what the sidecar pushes outward. The two things it must still do
itself are the two the engine cannot: a native folder picker and opening the
settings dialog.

**Tech Stack:** TypeScript, esbuild, vitest (core unit tests), Kotlin 2.2 /
IntelliJ Platform Gradle Plugin 2.1, JCEF, Gson.

**Spec:** Section 19 is cited by six files and does not exist. Writing it is
Task 00 of this plan, because the sidecar protocol and the two-host split have
nowhere else to be described.

## Scope

**In scope:** pane 1 (Task SetUp) rendering and task creation, in both IDEs.

**Out of scope, and why.** Pane 2 — the workflow stepper — needs two things
this plan does not build:

1. **The `TaskSession.ts` lift.** 756 lines, heavily `vscode`-coupled, and it is
   what drives every step after setup.
2. **A reverse RPC direction.** `session.ts:sidecarHost()` stubs `copy`,
   `toTerminal` and `openInEditor` as deliberate throws ("the host has not wired
   X yet"). `IntellijHost.kt` implements all six members, but the protocol only
   carries host→sidecar *requests* and sidecar→host *pushes* — there is no way
   for the engine to call into the JVM and get an answer. Until that exists, a
   handoff step cannot reach the clipboard, which `session.ts` itself calls "the
   honest floor for a JVM host".

Pane 1 needs neither: the setup form has no command blocks and no handoff, so
the stubbed host members are never reached. That is what makes it a coherent
first milestone rather than half of a bigger one.

**Consequence to handle, not hide:** after this plan, pressing *Start task* in
IntelliJ creates a real task on disk and then has no pane 2 to open. Task 05
makes the form say so plainly instead of appearing to do nothing.

## Global Constraints

Every task's requirements implicitly include this section.

- **`npm run verify` must pass at the end of every task.** Typecheck, lint,
  unit tests and `check:parity`.
- **`check:parity` is a hard gate on four of these tasks.** It compares versions,
  `HostPort` members against `IntellijHost.kt`, commands, settings, and reads
  `PROTOCOL_VERSION`. Adding a tenth setting to one plugin and not the other
  fails it; so does adding a `HostPort` member without a Kotlin `fun` of the
  same name.
- **`src/engine/**` may never import `vscode`.** Enforced by ESLint. Everything
  lifted out of `SetupView.ts` must take configured values as parameters.
- **`webview/**` may never import from `src/**`.** The renderer is not touched
  by this plan at all — if a task seems to need a renderer change, the
  descriptor is wrong.
- **`out/` is tracked.** A source change is not finished until `npm run build`
  has run and the bundles are committed with it.
- **The VS Code sidebar's behaviour does not change.** Every extraction is
  verified by VS Code continuing to render the same form, not by reading the
  diff.

## Tasks

| Task | What |
|---|---|
| [00](00-spec-section-19.md) | Write spec Section 19 — the two-host split and the sidecar protocol |
| [01](01-setup-descriptor-to-core.md) | Lift the setup descriptor out of `SetupView.ts` into core |
| [02](02-create-task-to-core.md) | Lift task creation out of `TaskSession.startWith` into core |
| [03](03-sidecar-setup-session.md) | The sidecar's setup session and the `message` protocol method |
| [04](04-intellij-wiring.md) | Node discovery, and wire `RendererPanel` to `Sidecar` |
| [05](05-intellij-local-actions.md) | Browse, Open Settings, and the honest "no pane 2 yet" path |
| [06](06-verification.md) | Both IDEs, and what is left |
