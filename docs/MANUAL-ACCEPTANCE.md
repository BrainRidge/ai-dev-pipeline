# Manual Acceptance Script — Phase 1

Automated tests cover the engine, the renderer, persistence and packaging. The
criteria below involve Copilot, a real workspace reload, or a human judgement,
so they must be walked by hand.

**Prerequisites**

- [ ] GitHub Copilot installed in VS Code and signed in
- [ ] Copilot **agent mode** enabled in settings
- [ ] Task 0 spike completed — you know which handoff mechanism (A/B/C) applies
- [ ] `workflows/platforms.yaml` edited to reference at least one repository you
      can actually clone

Install the build under test:

```bash
npm run verify && npm run build && npx vsce package --allow-missing-repository --skip-license
code --install-extension ai-dev-workflow-0.1.0.vsix
```

---

## Criteria

- [ ] **1. Start a task.** Run **AI Dev Workflow: Start Task**. Pick a platform,
      enter an epic key, pick Research Task.
      *Expected:* the workflow panel opens on "What are we researching?".

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
      Copy `workflows/research.yaml` to `workflows/scratch.yaml`, change `id` to
      `scratch` and `label` to `Scratch Task`, and reorder two steps. Rebuild and
      reload.
      *Expected:* "Scratch Task" appears as a task type and runs in the new order.
      **No file under `src/` or `webview/` was touched.**

      > If this required a code change, the architecture did not deliver D6.
      > Stop and report which step kind forced it — that is a spec-level finding,
      > not a bug to patch around.

- [ ] **12. A developer cannot alter a workflow.** Edit
      `.engine/workflow.yaml` inside a live task folder, then resume the task.
      *Expected:* a warning appears saying the definition was modified, and a
      `snapshot-modified` entry is written to the audit log. The task continues
      with the modified file — this is detection, not prevention, by design.

---

## Recording results

For any criterion that fails, note what happened instead. Criterion 11 failing
is a design finding and should go back to the spec; the others are ordinarily
bugs.
