# Epic Browser Fetch Implementation Plan

**Goal:** A **Fetch from browser** action beside the sidebar's Epic field that reads the
matching Jira ticket through a Chrome or Edge browser the developer is already signed into
via SSO, and offers the result as the starting text of `CollectRequirement`'s story field —
so a developer starting a task no longer retypes what Jira already has.

**Architecture:** The renderer gains one generic capability — a button that can sit beside a
single field (`RenderField.action`) — rather than anything epic-specific. Everything that
knows what "fetch" means lives in the host: `SetupView` handles the `fetchEpic` action id;
`src/browser/CdpSession.ts` talks to a Chromium browser over the Chrome DevTools Protocol,
using a dedicated automation profile rather than the developer's daily one, because Chrome and
Edge both ignore a `--remote-debugging-port` flag on a second launch against a profile already
running; `src/browser/JiraExtractor.ts` isolates the DOM knowledge of what a ticket page looks
like. The fetched text travels as `SetupSelection.epicContext`, alongside `epic`, into
`TaskState.inputs`, the same path `featureStory` already takes. `TaskType.describe` gains an
optional `initialValues` so a taskType can offer a default without the generic
`StepDescriptor.ts` knowing why — `CollectRequirement` is the first to use it.

**Tech Stack:** TypeScript, esbuild, vitest (unit + renderer under jsdom), `@vscode/test-cli`
(integration), `zod`, `yaml`, `chrome-remote-interface` (new — see
[Consequences](../../spec/19-epic-browser-fetch.md#consequences)), ESLint with import-boundary
rules.

**Spec:** [`docs/spec/19-epic-browser-fetch.md`](../../spec/19-epic-browser-fetch.md)

## Global Constraints

Every task's requirements implicitly include this section.

- **`src/engine/**` may never import `vscode`.** Enforced by ESLint.
- **`webview/**` may never import from `src/**`.** Enforced by ESLint. `RenderField.action` is
  duplicated by hand into `webview/render/fields.ts`, matching how the rest of that file's
  types mirror `src/tasks/context.ts` without importing it.
- **`postMessage` may appear only in `src/bridge/WebviewBridge.ts`.** Enforced by ESLint.
- **The renderer never references a workflow, step or field by name.** `fields.ts` draws
  `field.action` generically; it does not know `fetchEpic` exists.
- **Runtime dependencies were limited to `yaml` and `zod`.** This plan is what spends that
  budget — see [Task 6](06-dependency-and-settings.md). No second new dependency without a
  further spec change.
- **`npm run verify` must pass at the end of every task.**
- **`out/` is tracked.** A source change is not finished until `npm run build` has run and the
  bundles are committed in the same commit.
- **British spelling** in prose and user-facing copy: *behaviour*, *organisation*.
- **`src/browser/**` touches a real network and a real subprocess, so it is tested exactly the
  way `src/content/ContentRoot.ts` tests filesystem access: behind an injected interface, never
  against a real browser in the unit tier.** A real Chrome/Edge is only exercised by hand, in
  [`MANUAL-ACCEPTANCE.md`](../../MANUAL-ACCEPTANCE.md) ([Task 7](07-documentation.md)).

### Shared types

Defined in the task noted; later tasks refer to these exact names.

```typescript
// webview/render/fields.ts and src/tasks/context.ts — Task 0
export interface RenderField {
  // ...existing properties
  /** A single button drawn inline beside the field. Fires like any step action. */
  action?: { id: string; label: string }
}

// src/browser/CdpSession.ts — Task 1
export interface BrowserTarget {
  navigate(url: string): Promise<void>
  /** Waits for network idle, then runs `script` in the page and returns its result. */
  extract<T>(script: string): Promise<T>
  close(): Promise<void>
}
export interface BrowserLauncher {
  /** Finds (or starts) the dedicated automation profile and returns an attached session. */
  session(): Promise<{ openTarget(): Promise<BrowserTarget> }>
}

// src/browser/JiraExtractor.ts — Task 2
export interface EpicTicket {
  title: string
  description: string
  acceptanceCriteria: string
}

// src/browser/BrowserEpicFetcher.ts — Task 3
export type FetchResult =
  | { ok: true; ticket: EpicTicket }
  | { ok: false; message: string }

// src/tasks/TaskType.ts — Task 5
export interface TaskView {
  // ...existing properties
  /** Shown only until the developer (or a saved answer) supplies a value of its own. */
  initialValues?: Answers
}
```

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `webview/render/fields.ts` | `RenderField.action`; draws the inline button | 0 |
| `src/tasks/context.ts` | `RenderField.action`, mirrored | 0 |
| `src/browser/CdpSession.ts` | **New.** Find/launch the dedicated profile; attach over CDP; open, navigate, extract from, and close a background tab | 1 |
| `test/browser/CdpSession.test.ts` | **New.** Against a fake `BrowserLauncher`/`BrowserTarget` | 1 |
| `src/browser/JiraExtractor.ts` | **New.** Ticket DOM → `EpicTicket` | 2 |
| `test/browser/JiraExtractor.test.ts` | **New.** Against fixed HTML fixtures | 2 |
| `src/browser/BrowserEpicFetcher.ts` | **New.** Composes 1 + 2; builds the ticket URL from `jiraBaseUrl`; every error string | 3 |
| `test/browser/BrowserEpicFetcher.test.ts` | **New.** | 3 |
| `src/session/SetupView.ts` | Epic field gets `action`; `onAction` handles `fetchEpic`; loading/error state | 4 |
| `src/session/SetupSelection.ts` | `epicContext: string` | 5 |
| `src/session/TaskSession.ts` | `inputs.epicContext`, conditionally, like `featureStory` | 5 |
| `src/tasks/TaskType.ts` | `TaskView.initialValues` | 5 |
| `src/engine/StepDescriptor.ts` | Merges `initialValues` under `prefill` for the current step | 5 |
| `src/tasks/CollectRequirement.ts` | Sets `initialValues.story` from `ctx.inputs.epicContext` | 5 |
| `package.json` | `chrome-remote-interface` dependency; `aiDevWorkflow.jiraBaseUrl` setting | 6 |
| `docs/MANUAL-ACCEPTANCE.md` | New criteria: the button, a cold-start login, a warm fetch, every failure message | 7 |
| `test/integration/` | Extends the existing sidebar coverage with a `fetchEpic` round trip against a stub bridge | 8 |

Spec and decision docs (`docs/spec/19-epic-browser-fetch.md`, `docs/spec/04-decisions.md` D10,
`docs/spec/README.md`, `docs/plans/README.md`) are already written, ahead of this plan, per the
project convention that a plan is written from the spec.

## Tasks

0. [The renderer's field-level action](00-renderer-field-action.md)
1. [CdpSession — reaching a signed-in Chromium browser](01-cdp-session.md)
2. [JiraExtractor — reading a ticket](02-jira-extractor.md)
3. [BrowserEpicFetcher — composing the two, and every failure string](03-browser-epic-fetcher.md)
4. [Wiring the button into the sidebar](04-setup-view-wiring.md)
5. [Carrying the result into the workflow](05-carrying-the-context.md)
6. [The dependency, and the setting](06-dependency-and-settings.md)
7. [Documentation](07-documentation.md)
8. [End-to-end verification](08-verification.md)

## Ordering, and why

Task 0 is a pure renderer change, importable by nothing else yet, so it goes first and is
independently testable under jsdom. Tasks 1–2 are pure modules behind injected interfaces —
same shape as `src/content/ContentRoot.ts` — and have no dependency on each other's internals,
but 3 composes both, so 1 and 2 precede it. Task 4 is the first place real wiring happens, and
it depends on both 0 (the button exists) and 3 (something to call when it is pressed) — doing
it earlier would mean wiring a button to nothing. Task 5 is deliberately separated from Task 4:
Task 4 makes the fetch work and land in `this.values.epicContext` inside `SetupView`, fully
testable by itself; Task 5 is what makes that value survive into the next screen, which is a
different, `vscode`-free surface (`SetupSelection`, `TaskSession`, `StepDescriptor`,
`CollectRequirement`) with its own tests. Task 6 — the dependency and the setting — is placed
after the code that needs them because `npm run verify` must stay green at every step, and
declaring an unused dependency or an unread setting earlier would itself be worth flagging in
review. Tasks 7–8 close the loop the same way `external-content/`'s final two tasks did.

## Self-Review Notes

**Spec coverage:** every part of [Section 19](../../spec/19-epic-browser-fetch.md) maps to a
task — *Reaching a signed-in session* → 1; *The fetch itself* → 1, 2, 3; *Where the result
lands* → 5; *The renderer contract gains a field action* → 0; *Failure modes* → 3, 4;
*Consequences* → 6, 7; *Relationship to P3* → no task, it is a decision recorded in the spec
rather than something to build.

**Deliberately not in this plan:**

- **Safari.** [Section 19](../../spec/19-epic-browser-fetch.md#non-goals) explains why; nothing
  here builds toward it.
- **A setting for the debug port or the automation profile's location.** Both are fixed
  (`9222`, and a folder under `context.globalStorageUri`) rather than user-configurable —
  another knob here would be a setting nobody has a reason to change, which
  [Section 16](../../spec/16-external-content.md)'s own settings avoid where they can.
- **Retrying a fetch automatically on failure.** Every failure is a field error and the
  manual textarea still works; an automatic retry against a login redirect would just open
  more tabs behind the developer's back.
