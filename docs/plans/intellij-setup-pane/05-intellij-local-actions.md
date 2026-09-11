# Task 5: The two IDE actions, and the honest edge

> Part of the [IntelliJ setup pane plan](README.md).

Two of the form's actions are dialogs the engine cannot open, and one leads
somewhere that does not exist yet.

**`browse`** — `FileChooser.chooseFile` with a folder descriptor, then the
chosen path goes back in as a `values` update and the form re-renders.

**`openSettings`** — `ShowSettingsUtil.showSettingsDialog` targeting
`AiDevWorkflowConfigurable`. This is the action on the unconfigured wall, so
it is the one path out of a misconfigured install.

**`start`, and what follows it.** The task is created on disk by `createTask`,
and then there is no pane 2 to open. The form must say that, in the pane,
naming the task id that now exists — because the alternative is a button that
appears to do nothing, which is indistinguishable from the bug this plan
fixed. A `notice` on the re-rendered descriptor is enough; no new renderer
support is needed.

**`open`** — same: the task exists, pane 2 does not. Same treatment.

**Files:**
- Modify: `.../sidecar/SetupSession.kt` — handle the `host` event
- Modify: `tool/core/src/sidecar/setupSession.ts` — the post-create notice
- Modify: `tool/core/test/sidecar/setupSession.test.ts`

---

- [ ] **Step 1: Handle the `host` event** for both actions.

- [ ] **Step 2: The post-create notice**, naming the task id.

- [ ] **Step 3: `npm run verify`** and walk both actions in `runIde`.
