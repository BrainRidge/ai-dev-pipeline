# Task 2: Task creation moves into core

> Part of the [IntelliJ setup pane plan](README.md).

`TaskSession.startWith` does two separable things: it creates the task on disk,
then it opens pane 2. The first half is already almost pure — `catalog.get`,
`TaskWorkspace.create`, `TaskStateStore.write`, `AuditLog.append`, all core —
wrapped in `vscode.ExtensionContext` only to find two directories.

The second half (`TaskSession.open`, `openCopilotChatBeside`) stays in VS Code.
This plan does not lift pane 2.

**Files:**
- Create: `tool/core/src/session/createTask.ts`
- Create: `tool/core/test/session/createTask.test.ts`
- Modify: `tool/core/src/index.ts`
- Modify: `tool/vscode-plugin/src/session/TaskSession.ts` — `startWith` calls it

**Interfaces:**
- Produces: `createTask(input: {tasksRoot, workflowsDir, catalog, selection}):
  Promise<{taskId: string; dir: string; state: TaskState}>`

**Constraint:** the `inputs` map, the `TaskState` shape and the
`task-started` audit entry are unchanged — a task created by either IDE must
be resumable by the other.

---

- [ ] **Step 1: Write the failing test** — a created task's state file and
  audit entry, and `featureStory` present only when the selection has one.

- [ ] **Step 2: Implement `createTask`** by moving the first half of
  `startWith`.

- [ ] **Step 3: Rewrite `startWith`** to call it and keep only the pane-2 half.

- [ ] **Step 4: `npm run verify`**, then start a task in VS Code and confirm
  the panel opens as before.
