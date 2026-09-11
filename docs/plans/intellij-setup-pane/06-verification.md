# Task 6: Verification

> Part of the [IntelliJ setup pane plan](README.md).

**Files:**
- Modify: `docs/MANUAL-ACCEPTANCE.md`

---

- [ ] **Step 1: `npm run verify`** — typecheck, lint, unit, parity.

- [ ] **Step 2: `npm run build`** — both bundles; commit `out/` with the source.

- [ ] **Step 3: VS Code, unchanged.** Sidebar renders in both modes; the
  sample-catalogue banner still appears; a task still starts and opens pane 2.

- [ ] **Step 4: IntelliJ, working.** `runIde`: the tool window draws the form,
  the task-type select re-renders the fields, Browse opens a picker, an invalid
  submit shows field errors, a valid submit creates a task under the tasks root
  and says so.

- [ ] **Step 5: Cross-IDE.** A task created in IntelliJ resumes in VS Code.
  This is the real test of Task 2 — one state format, two writers.

- [ ] **Step 6: Record what is left** in `MANUAL-ACCEPTANCE.md`: pane 2 and the
  reverse host RPC, per the plan's Scope section.
