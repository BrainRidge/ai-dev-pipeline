# 10. Repository layout

> Part of the [AI Dev Workflow Phase 1 design](README.md).

```
ai-dev-workflow/
├── README.md                     how to clone, install and work on it
├── package.json                  contributes: commands, views, configuration
├── CLAUDE.md                     conventions an agent working here must not break
├── src/
│   ├── extension.ts              activation, commands, resume-on-open
│   ├── engine/                   no vscode import, enforced by ESLint
│   │   ├── schema.ts             zod schemas; the authoritative model
│   │   ├── WorkflowCatalog.ts    load and validate bundled JSON
│   │   ├── ToolCatalog.ts       the tool list, and version comparison
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
│   │   ├── SystemCheck.ts
│   │   ├── ToolProbe.ts         is a tool on this machine, behind an interface
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
│   ├── audit/summary.ts          what the session logs say, for V1
│   ├── providers/                the MCP seam
│   │   ├── Provider.ts           interface + registry
│   │   ├── ManualProvider.ts     offers no choices, so a field is free entry
│   │   └── registry.ts           where P3 registers a JiraMcpProvider
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
├── prompts/
│   ├── <workflowId>/<stepId>.md   the per-file fallback; still bundled
│   ├── _shared/*.md               files a template pulls in with include:
│   └── skills/*.md                personas a workflow step names in `prompts`
├── examples/content-template/    what a team copies; config/ lives here now
├── .github/workflows/verify.yml  the gate on every pull request
├── release.mjs                   verify, bump, build, check, package, manifest
├── package-check.mjs             what must and must not be in the .vsix
├── update-manifest.json          what the startup update check reads
├── .vscodeignore                 what ships in the .vsix — excludes all, names each file back
├── .vscode-test.mjs              points @vscode/test-cli at out/test/integration/
├── out/                          the four bundles + stylesheet are tracked; the rest is not
├── test/
└── docs/
```

Three directories ship inside the `.vsix` besides `out/`: `workflows/`, `prompts/` and
`examples/`. `.vscodeignore` excludes everything else — including the sourcemaps and the
unbundled `tsc` output that `npm run compile:test` leaves in `out/`. It excludes everything
with `**` and then names each file that ships, rather than excluding directory by directory,
because `vsce` applies negations as a union at the end rather than in order: a broad `!out/**`
followed by carve-outs does not work, the carve-outs lose. Naming each file has the side
benefit that new junk at the repository root cannot leak into a release by default.

The package is 25 files: four bundles, three workflows, seven prompt templates, one shared
prompt fragment, two skill prompts, the five under `examples/content-template/`, the icon,
`package.json` and `README.md` — the last of which `vsce` ships whatever `.vscodeignore` says,
because it is what VS Code shows on an installed extension's details page. `npx vsce ls` prints
exactly that list, and is the cheapest way to catch the file going missing again.

The four bundles and the stylesheet in `out/` are tracked because `package.json`'s `main`
points into it, so a checkout stays installable without a build step. The cost is that a
source change is not finished until the bundles are rebuilt in the same commit — which CI now
checks ([Section 11](11-build-test-and-enforcement.md)) rather than trusting.

**Nothing else in `out/` is tracked.** The sourcemaps never ship and rewrite themselves on
every build, and the unbundled `tsc` output under `out/src`, `out/test` and `out/webview` is
rewritten by `pretest:integration` — so running the integration tier used to dirty a hundred
tracked files. `.gitignore` names the five that belong and excludes the rest, which is the
same shape as `.vscodeignore`'s rule and for the same reason.
