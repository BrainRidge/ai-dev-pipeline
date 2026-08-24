# 7. Run state and persistence

> Part of the [AI Dev Workflow Phase 1 design](README.md).

## The reload problem

Opening a multi-root workspace restarts the extension host. A task does this at the
`gitClone` step whenever a workspace is generated. Therefore every state transition is
written to disk before it takes effect.

The restart is now avoidable rather than certain. If every repository in scope is already
inside a folder open in the current window, no workspace is generated and no reload is
offered — the developer is already working the way the generated workspace would have
arranged for. The persistence rule is unchanged: it is what makes the restart survivable
when it does happen, and what makes closing VS Code mid-task harmless.

## Flow

```
  Sidebar: platform → epic → task type → base branch → microservices → work directory
        │                            (or: Continue an existing task)
        ▼
  Create  ~/ai-dev-workflow/tasks/<taskId>/
            .engine/
              _state.json     run state
              workflow.json   snapshot of the workflow definition (D8)
              audit.jsonl     append-only log
              prompt.md       written only by handoff mechanism C
            02-analysis.md    artifacts live at the root, where the user works
        │
        ▼
  Steps run … reaches gitClone; the developer runs the commands themselves
        │
        ├── repos already inside an open folder ──▶ no workspace, no reload
        │
        ▼
  Generate <taskId>.code-workspace and offer to open it
        {
          "folders":  [ reference-data-service/, party-service/, <taskId>/ ],
          "settings": { "aiDevWorkflow.taskId": "<taskId>" }
        }
        │
        ▼
  Open that workspace  ═══════ EXTENSION HOST RESTARTS ═══════
        │
        ▼
  Reactivate → read aiDevWorkflow.taskId from workspace settings
             → load _state.json → resume at currentStepId
```

The `aiDevWorkflow.taskId` setting inside the generated `.code-workspace` file is the
mechanism that makes automatic resumption work. The workspace declares which task it belongs
to, so resuming requires no global registry and nothing that can drift out of sync. Reopening
the workspace weeks later resumes correctly.

The workspace file is written once. Reopening the panel after the reload must not re-prompt,
so a task that already has one is left alone.

## State file

```json
{
  "schemaVersion": 1,
  "taskId": "PLAT-1234-researchTaskWorkflow-20260814-01",
  "workflowId": "researchTaskWorkflow",
  "workflowVersion": "1.0",
  "platform": "canada-assisted",
  "epic": "PLAT-1234",
  "currentStepId": "aiHandoff",
  "workflowHash": "9f2c…",
  "inputs": {
    "services": ["ris", "pis"],
    "taskType": "researchTaskWorkflow",
    "baseBranch": "develop",
    "workDir": "/Users/you/work"
  },
  "steps": {
    "requirement": { "status": "complete", "answers": { "story": "why is checkout slow" } },
    "gitClone":    { "status": "complete", "result":  { "repos": [ … ], "branch": "develop" } },
    "aiHandoff":   { "status": "in_progress" }
  }
}
```

`workflowVersion` is what resume rebuilds the graph from, so a task keeps running the
definition it began with ([D8](04-decisions.md)). `inputs` holds the task-level facts
collected in the sidebar, which every step can read and no step re-asks for. `workflowHash`
is covered below.

Written atomically — temp file then rename — so an interrupted write can never leave a task
unopenable.

A step's `answers` also carry drafts the developer has not yet acted on, which is how an
edited handoff prompt survives a reload. See [Section 8](08-ai-handoff-step.md).

## Protecting the snapshot

The task folder is a workspace root, so everything in it is open in the developer's editor.
That creates a path by which a developer could edit `workflow.json` mid-task and change the
steps they are required to follow — defeating the separation of roles in
[Section 1](01-context.md).

Two measures, in order of importance:

1. **Engine files live under `.engine/`**, separated from the artifacts the user is meant to
   open and edit. The separation is by convention and clarity, not permission.
2. **The snapshot's content hash is recorded in `_state.json` when the task starts and
   verified on every resume.** A mismatch is written to the audit log and shown to the user
   as a warning; the task continues using the modified file.

This is deliberately **detection, not prevention**. Every user is a developer with full
filesystem access, so prevention is not achievable and pretending otherwise would be
dishonest engineering. The goal is that deviation from the standard process is visible in the
audit trail rather than invisible — which is sufficient for a tool whose purpose is
consistency, not security.

## Task id format

`<epic>-<workflowId>-<YYYYMMDD>-<NN>`, for example
`PLAT-1234-researchTaskWorkflow-20260814-01`. `NN` is a two-digit counter that disambiguates
multiple tasks started for the same epic and workflow on the same day. The id is used as the
task folder name, the `.code-workspace` filename and the audit log key, so it must be
filesystem-safe: any character outside `[A-Za-z0-9._-]` in the epic key is replaced with `-`.

**The counter is claimed by creating the directory, not by comparing names against a listing.**
That is a correction, and the failure it fixes is worth recording because nothing about it
looks like a filesystem problem from the panel. The comparison used `Array.includes`, which is
case-sensitive; macOS and Windows filesystems are not. An epic entered as `EPIC-001` one
morning and `epic-001` that evening produced two ids that the comparison called different and
the disk called the same, so the second task was created *inside the first one's folder* — with
`mkdir` cheerfully doing nothing — and overwrote its `_state.json` and workflow snapshot.

Two panels then held two tasks and shared one state file. Each transition wrote the whole
state, so whichever panel wrote last won: press Done in one and the other would put the old
status back. What the developer sees is a step that will not advance however many times they
press the button, with nothing wrong on screen and nothing wrong in the artifact.

`mkdir` without `recursive` fails with `EEXIST` if anything is already at that path, whatever
the filesystem thinks two names mean. Asking it, and taking the next counter on refusal, is the
only arrangement that is correct on every platform. After 99 attempts it gives up with a
message naming the epic, rather than looping.

## Task lifecycle rules

- **One active task per window.** The window's workspace determines the task; a second task
  means a second window.
- **The sidebar offers unfinished tasks.** Its Existing mode scans the tasks directory,
  reads each `_state.json`, and lists what still has work in it, most recent first. No
  database.
- **A task is finished when the step it is parked on is complete.** This is not recorded
  anywhere and does not need to be: the engine advances `currentStepId` to `nextStep` on
  every transition, so the current step is marked complete in exactly one case — that step
  was terminal.
- **A folder that cannot be read as a task is skipped, not reported.** These directories
  accumulate abandoned experiments, and one unparseable file must not cost the developer the
  whole list.
- **Finished tasks are not offered in the sidebar.** The `AI Dev Workflow: Resume Task`
  command still lists every folder, so they remain reachable.
- **Task folders persist indefinitely.** Archival is deferred to a later phase.
