# 14. Acceptance criteria for Phase 1

> Part of the [AI Dev Workflow Phase 1 design](README.md).

Phase 1 is complete when a developer can:

1. Open the sidebar, select a platform from bundled configuration, enter an epic key, choose
   a task type, name a base branch and select microservices from the catalogue.
2. Set a work directory, remembered between tasks, under which repositories are worked on.
3. Reach the `gitClone` step and be given the exact commands to put each selected repository
   on the base branch — with repositories already cloned offered a fetch rather than a clone
   — copy them or send them to a terminal, run them, and mark the step done.
4. Have a `.code-workspace` file generated and offered, **and not be offered one** when the
   repositories are already inside a folder open in the current window.
5. **Resume the workflow automatically after the resulting window reload**, at the correct
   step, with all previous answers intact.
6. Read the fully composed prompt in the panel, edit it, and send it to Copilot Chat.
7. Have a handoff contracted to a file complete only once that file exists and they confirm;
   have a handoff that produces edits complete on their confirmation alone.
8. Open, read and edit the produced artifact in a normal editor tab, then Approve or Revise —
   with Revise returning to the step that produced it.
9. Find a complete `audit.jsonl` recording every input, every action, the exact prompt as
   delivered, the handoff mechanism, the reviewed artifact's hash and every approval.
10. Close VS Code entirely, reopen the workspace, and resume at the correct step.
11. Pick up an unfinished task from the sidebar without knowing its id.

Additionally:

12. A **tool developer** can add a workflow with **no TypeScript and no HTML changes** — a
    new JSON file and new prompt templates in the extension repository, released as a new
    version. This proves [D6](04-decisions.md) was achieved.
13. A **developer** has no way to alter a workflow. Specifically: no setting, command or
    editable file changes which steps run, in what order, or what any prompt says. Tampering
    with the task's workflow snapshot is detected and logged rather than silently honoured
    ([Section 7](07-run-state-and-persistence.md)).

## Status

All of the above are implemented, and each is covered by tests.

Criterion 12 was proven twice on real work rather than on a throwaway: **New Feature** and
**Bug Fix** were each added as one JSON file and a few markdown templates, with no
TypeScript. A throwaway third workflow is also built and run inside the test suite, which is
what keeps the claim true as the code changes.

Criterion 13 holds for the workflow *definition*. It does not extend to the prompt: since a
handoff prompt is editable in the panel, a developer can change what is asked on a given
step without changing the workflow. That was a deliberate choice — see
[Section 8](08-ai-handoff-step.md) — and it narrows criterion 13 to what steps run and in
what order.
