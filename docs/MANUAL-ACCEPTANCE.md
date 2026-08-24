# Manual Acceptance Script — Phase 1

Automated tests cover the engine, the renderer, persistence and packaging. The
criteria below involve Copilot, a real workspace reload, or a human judgement,
so they must be walked by hand.

**Prerequisites**

- [ ] GitHub Copilot installed in VS Code and signed in
- [ ] Copilot **agent mode** enabled in settings
- [ ] Task 0 spike completed — you know which handoff mechanism (A/B/C) applies
- [ ] A content folder prepared: copy `examples/content-template/` somewhere,
      put at least one repository you can actually clone into
      `config/microservices.json`, and set **Content Root** to it

Install the build under test:

```bash
npm run release            # verify, build, check the package, write the manifest
code --install-extension ai-dev-workflow-$(node -p "require('./package.json').version").vsix
```

Add `-- patch` or `-- minor` to bump the version at the same time. See
[spec Section 13](spec/13-release-and-distribution.md).

---

## Criteria

- [ ] **0a. Settings pane.** Open Settings → Extensions → AI Dev Workflow.
      *Expected:* five entries in this order — Content Root, Microservice
      Config, Platform Config, Custom Prompts, Tool Config — each saying what it
      expects.

- [ ] **0b. Unset — the sample runs.** Clear all five and open the sidebar.
      *Expected:* a **working form**, with four platforms and two
      `example-…` services, under a banner reading *"⚠ Using the bundled sample
      catalogue — placeholder services that cannot be cloned. Set Content Root
      to your team's folder to work on real repositories."* — and **Start task
      as the only button**, since the banner already names the setting to change.
      At the foot of the pane, the build: *"AI Dev Workflow &lt;version&gt;"*. This is a
      fresh install's first experience, so read it as one.

- [ ] **0b1. A task runs on the sample.** Start a Research Task against a
      sample service and continue to Get the code, then run the commands.
      *Expected:* everything works up to the clone, which fails with *could not
      resolve host* against `git.example.invalid`. Nothing lands on your disk.
      Check `.engine/audit.jsonl` for `"source": "sample"`.

- [ ] **0c. Content Root fills the rest in, and the banner goes.** Set Content
      Root to your copy of the template.
      *Expected:* Microservice Config, Platform Config, Custom Prompts and Tool
      Config fill in with paths under it, the banner disappears, and the sidebar
      redraws into a working form without you touching anything else.

- [ ] **0d. Your own edit survives.** Change Custom Prompts to some other
      absolute path, then change Content Root to a different folder.
      *Expected:* the two config paths follow the new root; **Custom Prompts
      keeps your value.**

- [ ] **0e. Missing file.** Point Microservice Config at a path that does not
      exist.
      *Expected:* *"Microservice config not found at <that path>"*. The path
      shown is the one it actually looked at.

- [ ] **0f. Relative path.** Set Microservice Config to `./services.json`.
      *Expected:* *"aiDevWorkflow.microserviceConfig must be an absolute path.
      Got "./services.json"."*

- [ ] **0g. Invalid file.** Give two services the same `shortCode`.
      *Expected:* the loader's own wording — *"…share the shortCode …"* — not a
      generic "please configure" message.

- [ ] **1. Start a task.** Run **AI Dev Workflow: Start Task**. Pick a platform,
      enter an epic key, pick Research Task.
      *Expected:* the workflow panel opens on **Tool check**, the first of five
      nodes, badged `SYSTEM`.

- [ ] **1a. Tool check reports the machine.** Read the report.
      *Expected:* one line per tool with a version beside each one it found, and
      the caption above it naming the tool list — `(bundled default)` if you have
      not put `config/tools.json` in your content folder. Nothing was sent to
      Copilot: no chat turn appears.

- [ ] **1a1. Agent mode is checked up front.** Set `chat.agent.enabled` to
      `false` in Settings, then start a task and press **Re-check**.
      *Expected:* the report's first line reads *"Copilot agent mode  ✗  turned
      off"*, with a paragraph naming the setting and the organisation-policy
      case, and **Continue** is refused. Turn it back on, press **Re-check**, and
      it passes. This is the check spec Section 8 promised in P1 and never had.

- [ ] **1a2. The one-click handoff is reported but never blocks.** With Copilot
      Chat disabled, start a task.
      *Expected:* *"One-click handoff  ✗"* with wording saying nothing breaks and
      each handoff costs a paste — and the step still completes. The A → B → C
      ladder is why this is not fatal.

- [ ] **1a3. Skills are installed where Copilot finds them.** Start a task and
      read the second half of the report.
      *Expected:* `codebase-analyst` and `evidence-first` listed as installed,
      and `~/.copilot/skills/<name>/SKILL.md` on disk with `name:` and
      `description:` frontmatter. Open Copilot Chat and confirm the skills are
      offered there — this is the whole point of the step.

- [ ] **1a4. A skill you edited is not reverted.** Change a line in
      `~/.copilot/skills/codebase-analyst/SKILL.md`, then start another task.
      *Expected:* it reads *yours — left alone*, and your edit is still there.
      Delete the file and re-check: it comes back from the prompts folder.

- [ ] **1b. A missing required tool blocks the step.** Copy
      `examples/content-template/config/tools.json` into your content folder and
      add an entry with `"command": "definitely-not-installed"` and
      `"required": true`. Press **Re-check**.
      *Expected:* the tool is listed as not found with your `why` and `install`
      text beneath it, the caption now says `(external)`, and **Continue** is
      refused with a message naming that tool.

- [ ] **1c. Re-check picks up a change without restarting.** Mark that entry
      `"required": false` and press **Re-check**.
      *Expected:* it is now listed as optional, and **Continue** works. You did
      not have to close or restart the task.

- [ ] **1d. Copy the report.** Press **Copy report** and paste somewhere.
      *Expected:* the whole report, as shown, on the clipboard.

- [ ] **2. Scope form.** The microservices list shows exactly the services
      configured for the platform you chose.
      *Expected:* submitting with an empty research question is refused, with the
      error shown against that field.

- [ ] **3. Checkout.** Continue to "Get the code" and run the git commands.
      *Expected:* the selected repos are cloned under `~/ai-dev-workflow/code`,
      each on branch `<EPIC>-research`. You are then offered the generated
      workspace.

- [ ] **4. Resume after reload.** Accept "Open workspace".
      *Expected:* the window reloads and **the workflow panel reappears at
      "Supporting context"**, with the scope answers still recorded. This is the
      single most important criterion in the list — it is the mechanic the whole
      design is built around.

- [ ] **5. Context form.** Paste any JIRA text and call notes. Continue.

- [ ] **6. Handoff.** Press **Send to Copilot**.
      *Expected:* Copilot Chat opens with the fully composed prompt — template
      text, the repo path map with `#file:` references, the scope constraint,
      and the output contract naming `02-analysis.md`.

- [ ] **7. Dual completion condition.** Press **Done** *before* Copilot has
      written the file.
      *Expected:* the step refuses, saying `02-analysis.md` has not been written.
      Then let Copilot write it and press **Done** again.
      *Expected:* the step completes.

- [ ] **8. Artifact review.** `02-analysis.md` opens in a normal editor tab.
      Edit it, then press **Revise**.
      *Expected:* the workflow returns to "Run the analysis". Then press
      **Approve** on a second pass and the workflow completes.

- [ ] **9. Audit trail.** Open `~/ai-dev-workflow/tasks/<taskId>/.engine/audit.jsonl`.
      *Expected:* one line per action, including a `prompt-composed` entry
      containing the **exact** prompt that was sent, plus `output-detected` and
      the approval.

- [ ] **10. Cold resume.** Close VS Code entirely. Reopen the generated
      `.code-workspace`.
      *Expected:* the workflow resumes at the correct step.

- [ ] **11. A tool developer can add a workflow with no TypeScript and no HTML.**
      Copy `workflows/researchTaskWorkflow_1_0.json` to
      `workflows/scratchWorkflow_1_0.json` and change `label` to `Scratch Task`
      — the id and version come from the filename — then reorder two steps by
      editing their `nextStep`. Rebuild and reload.
      *Expected:* "Scratch Task" appears as a task type and runs in the new order.
      **No file under `src/` or `webview/` was touched.**

      > If this required a code change, the architecture did not deliver D6.
      > Stop and report which step kind forced it — that is a spec-level finding,
      > not a bug to patch around.

- [ ] **12. A developer cannot alter a workflow.** Edit
      `.engine/workflow.json` inside a live task folder, then resume the task.
      *Expected:* a warning appears saying the definition was modified, and a
      `snapshot-modified` entry is written to the audit log. The task continues
      with the modified file — this is detection, not prevention, by design.

- [ ] **13. Prompt fallback is visible.** Run a research task with no
      `prompts/` folder in your content root.
      *Expected:* the caption above the composed prompt reads
      *"Template: …/prompts/researchTaskWorkflow/aiHandoff.md (bundled default)"*.
      Now copy that template into `<contentRoot>/prompts/researchTaskWorkflow/`,
      change a line, and reopen the step.
      *Expected:* your wording appears, and the caption now says **(external)**.
      `audit.jsonl` records `templateSource` for both.

- [ ] **13a. A shared file is quoted, and its origin is captioned.** Run a New
      Feature task to the Implement the code step.
      *Expected:* the prompt contains a **House rules** section, and the caption
      above it has a second line — *"Includes: …/prompts/_shared/house-rules.md
      (bundled default)"*. Copy `_shared/house-rules.md` into your content
      folder, change a line, reopen the step.
      *Expected:* your wording appears and that line now says **(external)**,
      while the step's own template still says whatever it said before —
      the fallback is per file.

- [ ] **13b. A referenced file is named, not quoted.** Add
      `reference: "{{task.dir}}/notes.md"` to a template's frontmatter and
      reopen the step.
      *Expected:* a **Further reading** section listing `#file:` for that path,
      the caption naming it as *(not found)* while the file does not exist, and
      the `#file:` line present either way. Create the file and reopen.
      *Expected:* the *(not found)* marker goes; the prompt is unchanged.

- [ ] **13c. A missing include stops the step, visibly.** Point `include:` at a
      file that does not exist.
      *Expected:* the step shows *"includes … which was not found at …"* and the
      rest of the panel still renders. Unlike a reference, this one blocks.

- [ ] **14. A case-mismatched override is refused.** Rename your override to
      `aiHandoff.MD`.
      *Expected:* the step shows *found "aiHandoff.MD" … expected
      "aiHandoff.md"* rather than quietly using the bundled prompt.

- [ ] **15. A workflows folder in the content root is reported.** Create
      `<contentRoot>/workflows/` and reload the window.
      *Expected:* a warning saying workflow definitions are bundled and the
      folder is ignored.

- [ ] **16. A broken tool list is reported on its own step.** Put `[{` in
      `<contentRoot>/config/tools.json` and start a task.
      *Expected:* the Tool Check step shows *"Tool config at … is not valid
      JSON"* and refuses to continue — and **the rest of the panel still
      renders**, with every other step visible. A broken tool list must not blank
      the workflow.

- [ ] **17. The git plan runs in your shell.** On the `gitClone` step press
      **Send to terminal** and run the block. On Windows, do it once in
      PowerShell and once in Git Bash.
      *Expected:* it runs clean in every shell. The plan is now nothing but
      `git clone "<url>" "<path>"` and `git -C "<path>" …`, with no `cd` and no
      `mkdir`, so there should be nothing left for a shell to disagree about.
      A failure here is a real finding — see [spec Section 6](spec/06-workflow-schema.md).

- [ ] **18. Approval keeps a copy.** Approve an artifact, then edit the file in
      the task folder afterwards.
      *Expected:* `.engine/approved/<stepId>-<name>` still holds what you
      approved, and `_state.json` records both the hash and that path.

- [ ] **19. The handoff report says which mechanism worked.** Run
      **AI Dev Workflow: Handoff Report** after a few tasks.
      *Expected:* a markdown document naming the A/B/C distribution across every
      task on this machine. This is the answer to V1
      ([spec Section 12](spec/12-verification-tasks.md)) — record it, because
      nobody has ever had it.

---

## Recording results

For any criterion that fails, note what happened instead. Criterion 11 failing
is a design finding and should go back to the spec; the others are ordinarily
bugs. Criterion 17 failing is a known open question rather than a regression —
see [Section 17](spec/17-tool-check.md) on the Windows suffix handling, and
record which shell you used.
