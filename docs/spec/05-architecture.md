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
describes how the first three are enforced mechanically; invariant 5 is enforced by the engine
itself, which is better.

1. **The renderer never references a workflow or step by name.** Everything it needs arrives
   in the descriptor. A conditional on a workflow id in webview code is a defect.
2. **`WebviewBridge` is the only module that calls `postMessage`.** One seam to log and test.
3. **`src/engine/**` never imports `vscode`.** The engine and the catalogue are testable
   without an extension host.
4. **One `TaskType` class per primitive.** Growing the tool means adding a class, not editing
   a shared switch statement. Adding a *step* to a workflow means editing JSON.
5. **A primitive nominates the actions that complete it.** `TaskType.transitions` lists them,
   and `WorkflowEngine.submit` refuses anything else. Everything else a step offers — Copy,
   Send to Copilot, Re-check — is an affordance that acts on the current step. Before this,
   `submit` treated any action it did not recognise as a submission, so an affordance whose
   handler nobody remembered to write completed the step instead of doing nothing. Two such
   handlers had to be written for the System Check step alone.
6. **`WorkflowEngine` never touches the filesystem or git directly.** It works through
   `TaskStateStore` and the task types.
7. **`AuditLog` is append-only and written before the action it describes**, so a crashed
   step still leaves a record.
8. **The engine holds no authoritative state in memory.** Disk is the source of truth;
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

`ProviderRegistry` maps a provider name to an implementation. The only implementation is
`ManualProvider`, which offers no choices, so a field naming it is free entry.

**The indirection is live.** `CollectRequirement` marks its story field `provider: 'manual'`
and resolves that name through the registry on every render: a provider returning no options
leaves the field as authored, and a provider returning options turns the same field into a
selection. So `ManualProvider` produces exactly the textarea it always did, by a path that is
actually taken.

That distinction is the point. For a while nothing imported either class, and the spec recorded
the seam as "a design intention with a placeholder" — which was honest but risked P3 being
planned as *implementing a provider* when the real work was *building the seam, then*
implementing one. `defaultProviders()` in `src/providers/registry.ts` is where P3 registers
`JiraMcpProvider`, and the test that turns the story field into a list of epic stories is the
proof that nothing else has to move: not the engine, not a step handler, not the renderer.

What remains untested is a provider that does real I/O — latency, failure and authentication
are all still ahead. The seam works; whether it survives a network is P3's question.
