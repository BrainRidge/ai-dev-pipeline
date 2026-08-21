# External Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the platform and microservice catalogues, and the prompt templates, out of the extension bundle and behind a single `aiDevWorkflow.contentRoot` setting, so that one build serves teams with different repositories and different prompt wording.

**Architecture:** A new pure module, `src/content/ContentRoot.ts`, turns the setting into concrete paths and resolves each prompt template to either the team's copy or the bundled default. It copies the shape of the existing `resolveTasksRoot`/`resolveCodeRoot` functions in `src/session/resume.ts`: a pure function taking `configured: string | undefined`, no `vscode` import, unit-testable with no extension host. `WorkflowCatalog.load` keeps its signature — it already takes a `configDir`. `PromptComposer` is the one real interface change: its constructor takes a resolver function instead of a directory.

**Tech Stack:** TypeScript, esbuild, vitest (unit + renderer under jsdom), `@vscode/test-cli` (integration), `zod`, `yaml`, ESLint with import-boundary rules.

**Spec:** [`docs/spec/16-external-content.md`](../../spec/16-external-content.md)

> **Superseded in part.** This plan designs a single `aiDevWorkflow.contentRoot` setting.
> After it shipped, that was split into three specific settings — Microservice Config,
> Platform Config and Custom Prompts — with the content root kept as the convenience that
> fills them in. The plan is left as written, because a plan records what was built at the
> time; [Section 16](../../spec/16-external-content.md) is the live description.

## Global Constraints

Every task's requirements implicitly include this section.

- **`src/engine/**` may never import `vscode`.** Enforced by ESLint. `src/content/**` is new and has no rule of its own, but it is imported by the engine's neighbours and must stay equally pure — take probes and configured values as parameters.
- **`webview/**` may never import from `src/**`.** Enforced by ESLint. Types shared with the renderer are duplicated by hand in `webview/render/fields.ts`; that duplication is deliberate.
- **`postMessage` may appear only in `src/bridge/WebviewBridge.ts`.** Enforced by ESLint.
- **The renderer never references a workflow or step by name.** Everything it needs arrives in the descriptor.
- **Runtime dependencies stay limited to `yaml` and `zod`.** Anything else requires a spec change.
- **`npm run verify` must pass at the end of every task.** It runs typecheck, lint and the unit tiers, and it is the gate before a commit.
- **`out/` is tracked.** A source change is not finished until `npm run build` has been run and the bundles are committed in the same commit.
- **Terminology:** "tool developer" = the team building this extension. "developer" (unqualified) = the person using it.
- **British spelling in prose and user-facing copy**, matching the existing spec and code comments: *behaviour*, *catalogue*, *standardise*.

### Copy that must be used verbatim

These strings are asserted by tests and read by developers. Do not reword them.

| Constant | Text |
|---|---|
| `NOT_CONFIGURED_MESSAGE` | `No content folder configured. Set aiDevWorkflow.contentRoot in Settings → Extensions → AI Dev Workflow.` |
| Relative path | `aiDevWorkflow.contentRoot must be an absolute path. Got "<value>".` |
| Missing file | `<filename> not found at <resolved path>` |
| Case mismatch | `found "<actual>" in <dir>, expected "<expected>"` |

### Shared types

Defined in Task 0 unless noted. Later tasks refer to these exact names.

```typescript
export type TemplateSource = 'external' | 'bundled'

export interface ResolvedTemplate { path: string; source: TemplateSource }

export type ContentRootResult =
  | { ok: true; root: string }
  | { ok: false; message: string }

/** Injected so resolution is testable without touching a disk. */
export interface DirectoryProbe {
  /** Filenames in a directory, or undefined if the directory does not exist. */
  list(dir: string): Promise<string[] | undefined>
}

export type TemplateResolver =
  (workflowId: string, stepId: string) => Promise<ResolvedTemplate>

/** Task 1. Replaces `{ prompt, outputFile }`. */
export interface ComposedPrompt {
  prompt: string
  outputFile?: string
  templatePath: string
  templateSource: TemplateSource
}
```

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/content/ContentRoot.ts` | **New.** Setting → paths; template resolution; provenance strings. Pure | 0 |
| `test/content/ContentRoot.test.ts` | **New.** The resolution matrix | 0 |
| `src/prompt/PromptComposer.ts` | Takes a `TemplateResolver`; reports provenance on every compose | 1 |
| `src/tasks/registry.ts` | Builds the resolver and passes it to the three handoff types | 1 |
| `src/tasks/context.ts` | `CommandBlock` gains `note?: string` | 2 |
| `src/tasks/promptBlock.ts` | Puts the provenance caption on the prompt block | 2 |
| `src/tasks/InvokeCopilot.ts` | Audit gains `templatePath` / `templateSource` | 2 |
| `src/tasks/CopilotEditingHandoff.ts` | Same, for the two editing handoffs | 2 |
| `webview/render/fields.ts` | Draws `block.note` | 2 |
| `webview/style.css` | `.cmd-note` | 2 |
| `package.json` | The `aiDevWorkflow.contentRoot` contribution | 3 |
| `src/session/TaskSession.ts` | Reads the setting at its three sites; surfaces load failures; writes `content-resolved` | 3 |
| `src/session/SetupView.ts` | The unconfigured sidebar and its **Open Settings** action | 4 |
| `examples/content-template/` | **New.** What a team copies to bootstrap | 5 |
| `.vscodeignore` | **New.** What ships in the `.vsix` | 5 |
| `config/` | **Deleted** | 5 |
| `docs/spec/04,06,08,10,14` | Corrected to match | 6 |
| `docs/MANUAL-ACCEPTANCE.md` | Corrected, and gains the three resolution states | 6 |
| `.vscode-test.mjs` | **New.** The integration tier cannot run without it | 7 |
| `test/integration/research-workflow.test.ts` | Points at the relocated config | 7 |

## Tasks

0. [The content root resolver](00-content-root.md)
1. [PromptComposer resolves through it](01-prompt-composer.md)
2. [Provenance: the caption and the audit fields](02-provenance.md)
3. [The setting, and TaskSession](03-setting-and-session.md)
4. [The unconfigured sidebar](04-sidebar.md)
5. [Relocating config, and packaging](05-config-relocation.md)
6. [Documentation corrections](06-documentation.md)
7. [End-to-end verification](07-verification.md)

## Ordering, and why

Each task must leave `npm run verify` green, which fixes the order more than
preference does.

Task 0 is additive and imported by nothing. Task 1 changes `PromptComposer`'s
constructor, so it must update every construction site — three in
`src/tasks/registry.ts` and six across the tests — in the same commit. Task 3
makes the extension read the setting while `config/` is still on disk, so
nothing breaks; only then does Task 5 move the directory and repoint the tests
that load it. Moving it earlier would leave the tree red between two tasks.

## Self-Review Notes

**Spec coverage:** every section of [Section 16](../../spec/16-external-content.md)
maps to a task — *What moves* → 3, 5; *The setting* → 3; *Layout* → 0, 5;
*Resolution* → 0, 3, 4; *Prompt fallback and the case guard* → 0, 1;
*Provenance* → 2, 3; *Prompts are not snapshotted* → no task, it is a decision
to record rather than build; *Consequences for D2 and criterion 13* → 6;
*Bootstrapping* → 5; *Packaging* → 5; *Documents this change invalidates* → 6.

**Two problems found in the existing tree while planning, both handled in Task 7
because this change breaks them either way:**

- There is no `.vscode-test.mjs`, so `npm run test:integration` cannot run at
  all today, despite [spec Section 11](../../spec/11-build-test-and-enforcement.md)
  describing the tier. Task 7 adds it.
- `test/integration/research-workflow.test.ts` asserts that
  `config/microservices.json` ships inside the extension. Task 5 deletes that
  directory, so the assertion has to move with it.

**Deliberately not in this plan:** the `out/` tracking question. It is adjacent
— Task 5 adds the `.vscodeignore` that governs what ships — but untracking build
output contradicts a documented choice in
[Sections 10 and 15](../../spec/10-repository-layout.md) and belongs in its own
change.
