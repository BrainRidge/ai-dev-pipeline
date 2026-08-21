# 10. Repository layout

> Part of the [AI Dev Workflow Phase 1 design](README.md).

```
ai-dev-workflow/
├── package.json                  contributes: commands, views, configuration
├── CLAUDE.md                     conventions an agent working here must not break
├── src/
│   ├── extension.ts              activation, commands, resume-on-open
│   ├── engine/                   no vscode import, enforced by ESLint
│   │   ├── schema.ts             zod schemas; the authoritative model
│   │   ├── WorkflowCatalog.ts    load and validate bundled JSON
│   │   ├── WorkflowEngine.ts     nextStep traversal, transitions, persistence
│   │   ├── StepDescriptor.ts     the host→webview contract
│   │   ├── placeholders.ts       {{namespace.field}} resolution
│   │   └── taskId.ts
│   ├── session/
│   │   ├── SetupView.ts          pane 1
│   │   ├── SetupSelection.ts     sidebar validation, free of vscode
│   │   ├── TaskSession.ts        owns one task; routes every panel action
│   │   ├── taskIndex.ts          unfinished tasks under the tasks root
│   │   ├── openFolders.ts        is a repo already visible in this window
│   │   └── resume.ts             tasks/code roots, the taskId breadcrumb
│   ├── tasks/                    the step vocabulary — one class per primitive
│   │   ├── TaskType.ts           interface + registry
│   │   ├── context.ts            what a task may know about its run
│   │   ├── registry.ts           the vocabulary, wired to vscode
│   │   ├── CollectRequirement.ts
│   │   ├── GitClone.ts
│   │   ├── InvokeCopilot.ts
│   │   ├── CopilotEditingHandoff.ts   base for the two below
│   │   ├── InvokeCopilotCoding.ts
│   │   ├── InvokeCopilotCodeReview.ts
│   │   ├── ManualReview.ts
│   │   ├── CommandSink.ts        clipboard and terminal, behind an interface
│   │   ├── CopilotHandoff.ts     what the session needs from any handoff
│   │   ├── promptBlock.ts        the composed prompt as an editable block
│   │   └── history.ts            look behind this step for what it produced
│   ├── state/TaskStateStore.ts   atomic read/write of _state.json
│   ├── workspace/TaskWorkspace.ts folders, snapshot, .code-workspace
│   ├── prompt/PromptComposer.ts
│   ├── handoff/ChatHandoff.ts    the A → B → C ladder
│   ├── audit/AuditLog.ts
│   ├── bridge/WebviewBridge.ts   the only caller of postMessage
│   ├── providers/                the MCP seam; nothing imports it yet
│   └── update/UpdateCheck.ts
├── webview/                      may not import src/**, enforced by ESLint
│   ├── main.ts                   the workflow panel
│   ├── setup.ts                  the sidebar
│   ├── render/fields.ts          fields, command blocks, both layouts
│   ├── style.css                 VS Code theme variables only — panel only
│   └── fixtures/                 descriptors for browser-only development
├── workflows/                    <id>_<major>_<minor>.json
│   ├── researchTaskWorkflow_1_0.json
│   ├── newFeatureWorkflow_1_0.json
│   └── bugFixWorkflow_1_0.json
├── prompts/<workflowId>/<stepId>.md   the per-file fallback; still bundled
├── examples/content-template/    what a team copies; config/ lives here now
├── .vscodeignore                 what ships in the .vsix
├── out/                          built bundles; tracked deliberately
├── test/
└── docs/
```

Three directories ship inside the `.vsix` besides `out/`: `workflows/`, `prompts/` and
`examples/`. `.vscodeignore` excludes everything else — including the sourcemaps and the
unbundled `tsc` output that `npm run compile:test` leaves in `out/`. Its negations are named
per file type rather than per directory, because `vsce` applies them as a union at the end
rather than in order, so a broad `!out/**` followed by carve-outs does not work.

The package is 19 files: four bundles, three workflows, seven prompt templates, the three
under `examples/content-template/`, the icon and `package.json`.

`out/` is tracked because `package.json`'s `main` points into it, so a checkout stays
installable without a build step. The cost is that a source change is not finished until the
bundles are rebuilt in the same commit.
