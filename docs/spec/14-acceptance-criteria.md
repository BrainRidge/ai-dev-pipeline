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
13. A **developer** cannot change **which steps run, or in what order**. No setting, command
    or editable file alters the step sequence. Tampering with the task's workflow snapshot is
    detected and logged rather than silently honoured
    ([Section 7](07-run-state-and-persistence.md)).
14. A **team** can supply its own microservice catalogue and its own prompt wording through
    `aiDevWorkflow.microserviceConfig` and `aiDevWorkflow.customPrompts` — or through
    `aiDevWorkflow.contentRoot`, which fills both in — with no change to the extension
    ([Section 16](16-external-content.md)).
15. With a content path **relative, missing on disk or invalid**, the sidebar names the
    setting at fault, says which of those it is, and offers to open Settings. No task can be
    started until it is resolved. With a setting merely **unset**, the bundled sample is used
    instead — see criterion 20.
15a. Setting Content Root fills in Microservice Config, Platform Config and Custom Prompts,
    and never overwrites a value the developer changed themselves.
16. A prompt template the team has not supplied falls back to the bundled one; one that
    differs from the expected name only by case is reported rather than silently ignored.
17. Every handoff's composed prompt is captioned in the panel with the template it came from,
    and the audit log records that path and whether it was the team's or the bundled default.

18. Reach a **Tool Check** step at the start of every workflow, see which of
    their team's tools are installed and which are not, be told why each is
    wanted and how to install it on their platform, copy the report, and be
    prevented from continuing while a required tool is missing — with **Re-check**
    picking up an installation without restarting the task. No model call is made
    ([Section 17](17-tool-check.md)).

19. A **team** can decide what that step checks, by supplying
    `config/tools.json` in its content folder; a team that supplies none gets a
    working default, and the report and the audit log both say which list was
    used.

20. Install the extension, configure **nothing**, and open the sidebar: a working form
    appears with the four sample platforms and two sample services, above a banner saying the
    sample catalogue is in play and naming Content Root as the way to replace it. A task can
    be started and walked; its `gitClone` step fails when run, because the sample's git
    locations are unresolvable by design. The `content-resolved` audit entry records
    `source: "sample"` ([Section 16](16-external-content.md)).

21. A **tool developer** can give a handoff step more than one markdown file: `include:` in
    the template's frontmatter quotes a shared file into the prompt, `reference:` names a
    document for Copilot to open, and the panel caption and the audit log both record every
    file that shaped the prompt and whose it was. Adding either takes no TypeScript
    ([Section 8](08-ai-handoff-step.md)).

22. **Revise means something.** Sending an artifact back reopens the handoff, and the prompt it
    recomposes tells Copilot to read the edited artifact and improve it rather than starting
    again — which is what the step's own documentation promises
    ([Section 8](08-ai-handoff-step.md)).

23. **A misspelt placeholder is named rather than silently blank.** The caption above the
    prompt lists any placeholder that resolved to nothing, and the audit entry records them.
    A field on a step that has not answered yet is not reported, so a correct template is
    never warned about mid-typing.

24. **Only an action a primitive nominates can complete a step.** `TaskType.transitions`
    declares them and the engine refuses anything else, so a new affordance whose handler is
    missing does nothing instead of advancing the workflow
    ([Section 5](05-architecture.md)).

25. Every pull request runs typecheck, lint, the unit tiers, the extension-host tier, a check
    that the tracked bundles match their source, and a check on what the `.vsix` would contain
    ([Section 11](11-build-test-and-enforcement.md)).

26. **Approving keeps the artifact, not just its hash.** A copy lands in
    `.engine/approved/`, named after the step, and a copy that cannot be written is recorded
    as absent rather than claimed ([Section 8](08-ai-handoff-step.md)).

27. **The handoff mechanism is in the audit log**, and
    `AI Dev Workflow: Handoff Report` reports its distribution across every task on the
    machine — which is what closes V1 ([Section 12](12-verification-tasks.md)).

28. **The git plan runs in any shell.** Every line is a plain git invocation against a quoted
    absolute path, with no `cd`, no `mkdir` and nothing else a shell has to interpret
    ([Section 6](06-workflow-schema.md)).

29. **A field's provider is resolved rather than ignored.** `CollectRequirement` asks the
    registry for its story field's options; a provider returning none leaves free entry, and
    one returning options turns the field into a selection with no other change
    ([Section 5](05-architecture.md)).

30. **Agent mode is checked before a task starts, not discovered mid-workflow.** Tool Check
    reads `chat.agent.enabled` and refuses to continue while it is off, naming the
    organisation-policy case; a version of VS Code without the setting reports that it could
    not be checked and does not block ([Section 17](17-tool-check.md)). This closes the P1
    check that Section 8 recorded as unimplemented.

31. A **tool developer** can give an `aiHandoff` step several prompts from the workflow JSON —
    `"prompts": ["/skills/java-expert.md", …]` — composed in order ahead of the step's own
    template, with each one's path and origin shown in the panel caption and recorded in the
    audit log. A misnamed one fails when the catalogue loads; a missing one fails on the step
    that declares it ([Section 6](06-workflow-schema.md)).

32. The first step is **Tool Check**, and its report says which machine it ran on — `macOS`,
    `Windows` or `Linux` — ahead of the tool list. A tool that is a different program on a
    different platform can say so with `platforms`, and only that platform's command runs
    ([Section 17](17-tool-check.md)).

## Status

All of the above are implemented, and each is covered by tests.

Criterion 12 was proven twice on real work rather than on a throwaway: **New Feature** and
**Bug Fix** were each added as one JSON file and a few markdown templates, with no
TypeScript. A throwaway third workflow is also built and run inside the test suite, which is
what keeps the claim true as the code changes.

Criterion 13 has now been narrowed twice. It first excluded prompt wording, because a handoff
prompt is editable in the panel ([Section 8](08-ai-handoff-step.md)). It now also excludes the
prompt templates and the service catalogue, which a team owns
([Section 16](16-external-content.md)). What it still guarantees is the part the tool was
built for: every developer on a team passes through the same steps in the same order.

Criteria 14–32 are implemented and covered by tests. Criteria 22–24 each close a failure that
was found by reading the code rather than by anything failing: a promise in the workflow
documentation that nothing kept, a typo class that rendered as blank, and an engine that
treated an unrecognised button as a submission. Criterion 21 is demonstrated on real
bundled content rather than a fixture: `_shared/house-rules.md` is what removed the wording
that used to be duplicated at the bottom of `CodeImplementation.md` and `CodeFix.md`, and a
test per workflow asserts it is still quoted into both. Criterion 18 was the second
demonstration that adding a *kind* of step costs one class: `ToolCheck` needed
no change to `render/fields.ts` at all, only a badge colour in the stylesheet.

Criteria 14–17 are implemented and covered by tests. Criteria 15 and 16 are additionally
walked by hand, since the wording a developer reads is the whole point of them.
