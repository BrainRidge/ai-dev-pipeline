# AI Dev Workflow — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a VS Code extension that runs a declarative, YAML-defined research workflow end to end — gathering context, cloning repos, handing a composed prompt to Copilot Chat, and looping the developer through review of the resulting markdown.

**Architecture:** A state machine in the extension host reads bundled YAML workflow definitions and drives a generic webview renderer via typed JSON step descriptors. The renderer knows no workflow names. All run state is persisted to disk before each transition, because opening the generated multi-root workspace restarts the extension host mid-workflow. One `StepHandler` class per step kind; the engine never touches git or the filesystem directly.

**Tech Stack:** TypeScript, esbuild, vitest (unit + renderer), `@vscode/test-cli` (integration), `yaml`, `zod`, ESLint with import-boundary rules, `@vscode/vsce` for packaging.

**Spec:** [`docs/spec/`](../../spec/README.md)

## Global Constraints

Every task's requirements implicitly include this section.

- **Node ≥ 22**, VS Code engine floor `^1.96.0`. Verified available: Node 25.6.1, VS Code 1.133.0.
- **Runtime dependencies limited to `yaml` and `zod`.** No UI framework, no component library, no HTTP client. Anything else requires a spec change.
- **`webview/**` may never import from `src/**`.** Enforced by ESLint in Task 1.
- **`postMessage` may appear only in `src/bridge/WebviewBridge.ts`.** Enforced by ESLint in Task 1.
- **`src/engine/**` may never import `vscode`.** The engine is pure and testable without an extension host. Enforced by ESLint in Task 1.
- **The engine holds no authoritative state in memory.** Every transition writes `_state.json` before taking effect.
- **All state writes are atomic:** write to `<file>.tmp`, then `rename`.
- **Terminology:** "tool developer" = the team building this extension. "developer" (unqualified) = the person using it.
- **Task id format:** `<epic>-<workflowId>-<YYYYMMDD>-<NN>`, epic sanitised to `[A-Za-z0-9._-]`.
- **Task folder layout:** `~/ai-dev-workflow/tasks/<taskId>/` with engine files under `.engine/` and artifacts at the root.
- **Commit after every task.** Task 1 initialises the git repository.

### Shared types

These names and signatures are referenced across tasks. Defined in Task 2 unless noted.

```typescript
type StepKind = 'form' | 'git-ops' | 'ai-handoff' | 'artifact-review' | 'confirm'
type FieldType = 'text' | 'textarea' | 'select' | 'multiselect' | 'boolean'
                | 'repo-picker' | 'file-picker'
type StepStatus = 'pending' | 'current' | 'complete'

interface WorkflowDef  { id: string; label: string; platforms: string[]; steps: StepDef[] }
interface StepDef      { id: string; kind: StepKind; title: string; when?: string
                       ; fields?: FieldDef[]; repos?: string; ops?: string[]; branch?: string
                       ; prompt?: string; output?: string; artifact?: string; onRevise?: string }
interface FieldDef     { id: string; type: FieldType; label: string
                       ; required?: boolean; source?: string; provider?: string }

type Answers = Record<string, unknown>                    // fieldId -> value
interface StepRecord   { status: 'pending' | 'in_progress' | 'complete'
                       ; answers?: Answers; result?: Record<string, unknown> }
interface TaskState    { schemaVersion: 1; taskId: string; workflowId: string
                       ; platform: string; epic: string; currentStepId: string
                       ; workflowHash: string; steps: Record<string, StepRecord> }
```

## File Structure

| File | Responsibility |
|---|---|
| `src/extension.ts` | Activation, command registration, resume-on-open |
| `src/engine/schema.ts` | Zod schemas and the exported types above |
| `src/engine/WorkflowCatalog.ts` | Load and validate bundled YAML; resolve placeholder references |
| `src/engine/WorkflowEngine.ts` | Transitions, `when` evaluation, `onRevise` looping |
| `src/engine/StepDescriptor.ts` | The host→webview contract type and its builder |
| `src/engine/taskId.ts` | Task id construction and sanitisation |
| `src/steps/StepHandler.ts` | Interface: `validate` / `execute` / `describe` |
| `src/steps/*Step.ts` | One class per step kind |
| `src/state/TaskStateStore.ts` | Atomic read/write of `_state.json` |
| `src/workspace/TaskWorkspace.ts` | Task folder, workflow snapshot + hash, `.code-workspace` authoring |
| `src/prompt/PromptComposer.ts` | Deterministic four-part prompt assembly |
| `src/providers/Provider.ts`, `ManualProvider.ts` | The MCP migration seam |
| `src/audit/AuditLog.ts` | Append-only JSONL |
| `src/bridge/WebviewBridge.ts` | The only `postMessage` caller |
| `webview/main.ts` | Renderer entry: receives descriptor, posts actions |
| `webview/render/fields.ts` | One render function per field type |
| `webview/fixtures/*.json` | Descriptors for browser-only development |
| `workflows/platforms.yaml`, `workflows/research.yaml` | Bundled configuration |
| `prompts/research-analysis.md` | The prompt template |

## Tasks

0. [Spike — resolve the two verification questions](00-spike.md)
1. [Scaffold, build, lint boundaries, and activation](01-scaffold.md)
2. [Workflow schema and catalogue](02-workflow-catalogue.md)
3. [Task state persistence](03-state-persistence.md)
4. [Step handler interface and FormStep](04-step-handlers.md)
5. [WorkflowEngine transitions](05-engine-transitions.md)
6. [Audit log](06-audit-log.md)
7. [TaskWorkspace — folders, snapshot, workspace file](07-task-workspace.md)
8. [Step descriptor and webview bridge](08-descriptor-and-bridge.md)
9. [The renderer](09-renderer.md)
10. [Start Task command and resume-on-open](10-start-and-resume.md)
11. [GitOpsStep](11-git-ops-step.md)
12. [Prompt composition](12-prompt-composition.md)
13. [AiHandoffStep](13-ai-handoff-step.md)
14. [ArtifactReviewStep and ConfirmStep](14-review-and-confirm-steps.md)
15. [Bundled configuration content](15-bundled-configuration.md)
16. [Packaging and update check](16-packaging-and-updates.md)
17. [End-to-end verification against the acceptance criteria](17-end-to-end-verification.md)

## Self-Review Notes

**Spec coverage:** every section of the spec maps to a task — D1→13, D2→15, D3→7/10, D4→3/7, D5→4, D6→2/5/9, D7→16, D8→7, D9→13; Sections 5→1 (lint), 6→2/5, 7→3/7/10, 8→12/13, 9→8/9, 11→1, 12→0, 14→17.

**Known deviations from the spec, deliberate:**
- The spec's YAML uses `on_revise`; the schema uses `onRevise` for consistency with TypeScript naming. Task 15's bundled YAML uses `onRevise`. Update spec Section 6 when convenient — this is a naming choice, not a design change.
- `ConfirmStep` is implemented in Task 14 though no P1 workflow uses it. It is in the spec's catalogue and costs ~20 lines; omitting it would leave the catalogue incomplete.

**Coverage gap worth naming:** the `repo-picker` and `file-picker` field types are declared in the schema and rendered by the default branch of `renderField` as plain text inputs. No P1 workflow uses them. If P2 needs real pickers, that is a renderer change — the one place this plan knowingly leaves a stub.
