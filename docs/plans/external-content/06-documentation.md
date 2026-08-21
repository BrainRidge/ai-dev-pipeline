# Task 6: Documentation corrections

> Part of the [External content implementation plan](README.md).

Six documents currently state that config and prompts live in the extension
repository. Correcting them is part of this change, not a follow-up: per
[CLAUDE.md](../../../CLAUDE.md), when the code and the spec disagree the code is
right and the spec is the document to correct — so leaving them stale would make
the spec wrong the moment Task 5 lands.

Plans under `docs/plans/` are exempt. They are historical records of what was
built and are deliberately not corrected after the fact.

**No section is renumbered.** Section numbers are load-bearing: 24 source files
cite the design as `// See spec Section N`.

**Files:**
- Modify: `docs/spec/04-decisions.md`
- Modify: `docs/spec/06-workflow-schema.md`
- Modify: `docs/spec/08-ai-handoff-step.md`
- Modify: `docs/spec/10-repository-layout.md`
- Modify: `docs/spec/14-acceptance-criteria.md`
- Modify: `docs/MANUAL-ACCEPTANCE.md`
- Modify: `docs/plans/README.md`

---

- [ ] **Step 1: Narrow D2**

In `docs/spec/04-decisions.md`, under **Where implementation departed from
these**, change the opening line from "Four departures" to "Five departures" and
append:

```markdown
**D2 — config and prompts are no longer bundled.** Workflow definitions still
are: they remain in the extension repository, changed by pull request and
release, which is the part of D2 that standardises the process. The platform and
microservice catalogues and the prompt templates now come from a folder a team
maintains, behind the `aiDevWorkflow.contentRoot` setting, because one build
otherwise serves exactly one team. Accepted cost: the team owning the extension
no longer knows what any given team's prompts say. See
[Section 16](16-external-content.md).
```

- [ ] **Step 2: Correct Section 6**

In `docs/spec/06-workflow-schema.md`, in **Platform and microservice
configuration**, replace the first sentence:

```markdown
`config/platforms.json` lists the platforms and `config/microservices.json` is a
flat list of services with a short code, a name, a purpose, a git location and a
category. Both come from the team's content folder rather than from the extension
— see [Section 16](16-external-content.md) — and neither falls back to a bundled
copy. `examples/content-template/config/` holds the layout to copy.
```

Leave the rest of that subsection unchanged: platform still filters nothing, the
repository folder is still derived from the git location, and the load-time
rejections still apply.

Also, in **The bundled workflows**, append to the paragraph about prompt
templates:

```markdown
The template is looked for in the team's content folder first and falls back to
the bundled one per file ([Section 16](16-external-content.md)).
```

- [ ] **Step 3: Correct Section 8**

In `docs/spec/08-ai-handoff-step.md`, under **Prompt template format**, replace
the first sentence:

```markdown
Plain markdown with `{{namespace.field}}` placeholders, **found by convention**
at `prompts/<workflowId>/<stepId>.md` — under the team's content folder if they
have supplied that template, otherwise under the extension's own `prompts/`
directory ([Section 16](16-external-content.md)). Nothing in the workflow JSON
names a template. This is why adding a workflow needs a JSON file and some
markdown but no TypeScript.
```

Under **Audit coverage**, add to the **Captured** list:

```markdown
…and, for each handoff, the path of the template the prompt was composed from
and whether it was the team's or the bundled default.
```

- [ ] **Step 4: Correct Section 10**

In `docs/spec/10-repository-layout.md`, in the tree: delete the `config/` block,
and add after `prompts/`:

```
├── examples/content-template/    what a team copies; config/ lives here now
├── .vscodeignore                 what ships in the .vsix
```

Then replace the paragraph below the tree:

```markdown
Three directories ship inside the `.vsix` besides `out/`: `workflows/`,
`prompts/` and `examples/`. `.vscodeignore` excludes everything else, including
the sourcemaps and the unbundled `tsc` output that `npm run compile:test` leaves
in `out/`.
```

- [ ] **Step 5: Narrow criterion 13, and add the new criteria**

In `docs/spec/14-acceptance-criteria.md`, replace criterion 13 with:

```markdown
13. A **developer** cannot change **which steps run, or in what order**. No
    setting, command or editable file alters the step sequence. Tampering with
    the task's workflow snapshot is detected and logged rather than silently
    honoured ([Section 7](07-run-state-and-persistence.md)).
```

Append to the numbered list:

```markdown
14. A **team** can supply its own microservice catalogue and its own prompt
    wording through `aiDevWorkflow.contentRoot`, with no change to the extension
    ([Section 16](16-external-content.md)).
15. With the setting unset, or naming a folder whose config files are missing or
    invalid, the sidebar states which of those three it is and offers to open
    Settings. No task can be started until it is resolved.
16. A prompt template the team has not supplied falls back to the bundled one;
    one that differs from the expected name only by case is reported rather than
    silently ignored.
17. Every handoff's composed prompt is captioned in the panel with the template
    it came from, and the audit log records that path and whether it was the
    team's or the bundled default.
```

In the **Status** section, replace the closing paragraph about criterion 13 with:

```markdown
Criterion 13 has now been narrowed twice. It first excluded prompt wording,
because a composed prompt is editable in the panel
([Section 8](08-ai-handoff-step.md)). It now also excludes the prompt templates
and the service catalogue, which a team owns
([Section 16](16-external-content.md)). What it still guarantees is the part the
tool was built for: every developer on a team passes through the same steps in
the same order.
```

- [ ] **Step 6: Correct MANUAL-ACCEPTANCE.md, which was already stale**

`docs/MANUAL-ACCEPTANCE.md` still refers to YAML files that have never existed
in this tree. Fix those alongside the new checks.

| Currently says | Should say |
|---|---|
| `workflows/platforms.yaml` | `examples/content-template/config/microservices.json` |
| `workflows/research.yaml` → `workflows/scratch.yaml`, `id`/`label` keys | `workflows/researchTaskWorkflow_1_0.json` → `workflows/scratchWorkflow_1_0.json`; the id and version come from the filename, so only `label` is edited |
| `.engine/workflow.yaml` | `.engine/workflow.json` |

Replace the **Prerequisites** block:

```markdown
**Prerequisites**

- [ ] GitHub Copilot installed in VS Code and signed in
- [ ] Copilot **agent mode** enabled in settings
- [ ] A content folder prepared: copy `examples/content-template/` somewhere,
      put at least one repository you can actually clone into
      `config/microservices.json`, and set **aiDevWorkflow.contentRoot** to it
```

Insert three criteria before the current criterion 1, since they now gate
everything after them:

```markdown
- [ ] **0a. Unset.** Clear `aiDevWorkflow.contentRoot` and open the sidebar.
      *Expected:* the message *"No content folder configured. Set
      aiDevWorkflow.contentRoot in Settings → Extensions → AI Dev Workflow."*,
      an **Open Settings** button that lands on that key, and no form.

- [ ] **0b. Missing file.** Point the setting at a folder with no `config/`.
      *Expected:* *"platforms.json not found at <that path>"*. The path shown is
      the one it actually looked at.

- [ ] **0c. Invalid file.** Give two services the same `shortCode`.
      *Expected:* the loader's own wording — *"…share the shortCode …"* — not a
      generic "please configure" message.
```

Append two more:

```markdown
- [ ] **13. Prompt fallback is visible.** Run a research task with no
      `prompts/` folder in your content root.
      *Expected:* the caption above the composed prompt reads
      *"Template: …/prompts/researchTaskWorkflow/aiHandoff.md (bundled default)"*.
      Now copy that template into `<contentRoot>/prompts/researchTaskWorkflow/`,
      change a line, and reopen the step.
      *Expected:* your wording appears, and the caption now says **(external)**.
      `audit.jsonl` records `templateSource` for both.

- [ ] **14. A case-mismatched override is refused.** Rename your override to
      `aiHandoff.MD`.
      *Expected:* the step shows *found "aiHandoff.MD" … expected
      "aiHandoff.md"* rather than quietly using the bundled prompt.
```

- [ ] **Step 7: Mark the plan shipped**

In `docs/plans/README.md`, change this plan's row from `Not started` to
`Shipped`. The row itself already exists.

- [ ] **Step 8: Check every link resolves**

```bash
grep -oh '(\([0-9][0-9]-[a-z-]*\.md\))' docs/spec/*.md | tr -d '()' | sort -u \
  | while read -r f; do [ -f "docs/spec/$f" ] || echo "BROKEN: $f"; done
```

Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add docs/
git commit -m "docs: correct the six documents this change invalidates

D2 narrowed, criterion 13 narrowed a second time, Sections 6/8/10
repointed at the content folder, and MANUAL-ACCEPTANCE corrected — it
still referenced YAML files that never existed in this tree. No section
renumbered. See spec Section 16."
```
