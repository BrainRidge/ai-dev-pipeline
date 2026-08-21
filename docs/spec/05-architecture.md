# 5. Architecture

> Part of the [AI Dev Workflow Phase 1 design](README.md).

```
┌─────────────────── extension host (TypeScript) ───────────────────┐
│                                                                   │
│  SetupView            pane 1: collects the task-level facts, or   │
│        │              lists unfinished tasks to continue          │
│        ▼                                                          │
│  TaskSession          owns one task: its panel, its engine, and   │
│        │              the routing of every action the panel sends │
│        │                                                          │
│  WorkflowCatalog      loads + validates bundled JSON at startup   │
│        │                                                          │
│        ▼                                                          │
│  WorkflowEngine       owns run state; walks the nextStep graph;   │
│        │              persists before the caller sees a change    │
│        │                                                          │
│        ├──▶ TaskTypeRegistry ──┬── SystemCheck    (systemCheck)   │
│        │    (one class per     ├── CollectRequirement    (task)   │
│        │     primitive)        ├── GitClone     (commandExecution)│
│        │                       ├── InvokeCopilot      (aiHandoff) │
│        │                       ├── InvokeCopilotCoding (aiHandoff)│
│        │                       ├── InvokeCopilotCodeReview   (″)  │
│        │                       └── ManualReview          (manual) │
│        │                                                          │
│        ├──▶ TaskStateStore    _state.json, written atomically     │
│        │                                                          │
│        ├──▶ TaskWorkspace     per-task folder; workflow snapshot, │
│        │                      .code-workspace                     │
│        │                                                          │
│        ├──▶ PromptComposer    template + path map + scope +       │
│        │                      output contract, deterministically  │
│        │                                                          │
│        ├──▶ ChatHandoff       the A → B → C fallback ladder       │
│        │                                                          │
│        └──▶ AuditLog          append-only JSONL of every step,    │
│                               input and composed prompt           │
│                                                                   │
│  WebviewBridge        the ONLY module that talks to a webview     │
└───────────────────────────────┬───────────────────────────────────┘
                                │  typed JSON messages only
┌───────────────────────────────▼───────────────────────────────────┐
│  Renderer (webview)   renders a descriptor, posts answers back.   │
│                       Knows no workflow names. Serves both panes. │
└───────────────────────────────────────────────────────────────────┘
```

`StepDescriptor` builds the host→webview contract by asking every step to describe itself;
it is a pure function of the workflow, the state and the registry, so the whole panel can be
rendered in a unit test.

## Invariants

These are architectural rules, not style preferences. [Section 11](11-build-test-and-enforcement.md)
describes how the first three are enforced mechanically.

1. **The renderer never references a workflow or step by name.** Everything it needs arrives
   in the descriptor. A conditional on a workflow id in webview code is a defect.
2. **`WebviewBridge` is the only module that calls `postMessage`.** One seam to log and test.
3. **`src/engine/**` never imports `vscode`.** The engine and the catalogue are testable
   without an extension host.
4. **One `TaskType` class per primitive.** Growing the tool means adding a class, not editing
   a shared switch statement. Adding a *step* to a workflow means editing JSON.
5. **`WorkflowEngine` never touches the filesystem or git directly.** It works through
   `TaskStateStore` and the task types.
6. **`AuditLog` is append-only and written before the action it describes**, so a crashed
   step still leaves a record.
7. **The engine holds no authoritative state in memory.** Disk is the source of truth;
   memory is a cache. Opening a generated workspace restarts the extension host mid-task, so
   anything held only in memory is lost by design rather than by accident.

## The vocabulary is code; the composition is configuration

This is the line that makes [D6](04-decisions.md) work, and it is worth stating precisely
because it is easy to blur:

- Adding a step to a workflow, reordering steps, or adding a whole workflow → **JSON and
  markdown**. No TypeScript.
- Adding a new *kind* of step — something no existing primitive can express → **one class**
  implementing `TaskType`, registered in `src/tasks/registry.ts`.

A workflow names a `taskType` by string. `TaskTypeRegistry.validateWorkflow` checks at load
time that the name exists and that the `stepType` the JSON declares agrees with the one the
class declares, so a typo fails when the catalogue loads rather than three steps into a task.

## The provider seam

`ProviderRegistry` maps a provider name to an implementation. In P1 the only implementation
is `ManualProvider`, which renders an input field. When MCP becomes available, `JiraMcpProvider`
is registered under a new name and referenced from workflow JSON.

**As built, nothing imports either class.** Fields carry a `provider` key that no code reads;
`CollectRequirement` marks its story field `provider: 'manual'` and renders a textarea
regardless. The seam is a design intention with a placeholder behind it, not a working
indirection. Making it real is part of P3, not a detail of it — see
[D5's departure note](04-decisions.md).
