# Task 1: The setup descriptor moves into core

> Part of the [IntelliJ setup pane plan](README.md).

`SetupView.ts` is 422 lines and imports `vscode`. Its `render`,
`newDescriptor` and `existingDescriptor` methods are the only things that know
what the setup form looks like, and a JVM host cannot reach them.

Most of what they need is already core: `WorkflowCatalog`, `resolveAll`,
`resolveCodeRoot`, `listUnfinishedTasks`, `taskLabel`, `needsFeatureStory`,
`unconfiguredDescriptor`, `SAMPLE_NOTICE`. The `vscode` dependency is narrow
and entirely about *reading configuration* — `vscode.workspace.getConfiguration`
for `codeRoot`, and `resolvedContent(context)` / `tasksRoot()` from
`TaskSession.ts`, both of which are thin wrappers over already-pure core
functions.

So the extraction is: pass those values in. The new function is pure in the
sense that matters — it reads the filesystem (the catalogue, the task index)
but knows nothing about an IDE.

**Both branches move, and so does the error branch.** `render()` has three
outcomes: unconfigured/misconfigured, catalogue-load failure, and a form. All
three belong together, because choosing between them is the logic being lifted.

**Files:**
- Modify: `tool/core/src/session/setupDescriptor.ts` — add `buildSetupDescriptor`
- Create: `tool/core/test/session/buildSetupDescriptor.test.ts`
- Modify: `tool/core/src/index.ts` — export it
- Modify: `tool/vscode-plugin/src/session/SetupView.ts` — `render`,
  `newDescriptor` and `existingDescriptor` collapse into one call

**Interfaces:**
- Produces: `buildSetupDescriptor(input: SetupInput): Promise<SetupDescriptor>`
  where `SetupInput` carries `resolved: ResolvedContent`, `workflowsDir`,
  `tasksRoot`, `codeRoot: string | undefined`, `version`, `values`, `errors`.

**Constraint:** VS Code's rendered form must be byte-identical before and
after. The `mode` field, the field order, the wording of every `text` and the
`footer` shape are all part of the contract with the renderer.

---

- [ ] **Step 1: Write the failing test** — unconfigured, catalogue failure,
  new mode with and without `featureStory`, existing mode with and without
  saved tasks.

- [ ] **Step 2: Implement `buildSetupDescriptor`** by moving the three methods'
  bodies, replacing `this.values`/`this.errors` with parameters and
  `this.versionLine()` with `input.version`.

- [ ] **Step 3: Rewrite `SetupView.render`** to resolve its four values from
  `vscode` and delegate. `newDescriptor`/`existingDescriptor` are deleted.

- [ ] **Step 4: `npm run verify`**, then open the sidebar and confirm the form
  is unchanged in both modes.
