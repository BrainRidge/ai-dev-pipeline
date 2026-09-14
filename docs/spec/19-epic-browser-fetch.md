# 19. Fetching an epic from the developer's own browser

> Part of the [AI Dev Workflow Phase 1 design](README.md). Post-dates the P1–P4
> phasing in [Section 3](03-phasing.md), same as [Section 16](16-external-content.md)
> — it belongs to none of those phases, including P3, for the reason given under
> [Relationship to P3](#relationship-to-p3-and-the-provider-seam) below.

## Problem

Starting a task means typing an epic key into the sidebar, then separately
opening Jira, reading the ticket, and pasting its acceptance criteria into the
**JIRA story acceptance criteria as is** field a few steps later
(`CollectRequirement`, [Section 5](05-architecture.md)). The developer is
already signed into Jira through the organisation's SSO all day; retyping the
same login for an API integration would ask them to solve an already-solved
problem a second time.

## What this adds

A **Fetch from browser** action beside the sidebar's Epic field
(`SetupView.newDescriptor`, `src/session/SetupView.ts`). Clicking it:

1. Reads the epic key currently typed into that field.
2. Drives a Chromium browser — Chrome or Edge — over the Chrome DevTools
   Protocol (CDP) to open the ticket and read its content.
3. Offers the extracted text as the starting value of `CollectRequirement`'s
   story field. The developer can still edit or replace it; nothing is ever
   submitted on their behalf.

## Non-goals

- **Safari.** Safari's automation surface, `safaridriver`, runs WebDriver
  sessions in their own storage context. They do not share cookies with the
  browser the developer signs into by hand, so there is no equivalent action
  to take on Safari without asking the developer to log in a second time
  inside that automation context — which defeats the point. Safari is out of
  scope for this section; Chrome and Edge only.
- **Writing to Jira.** The fetch is read-only. Nothing this section describes
  changes a ticket.
- **A general web-scraping framework.** This is one adapter for one product's
  ticket page, not infrastructure for fetching arbitrary URLs.

## How it works

### Reaching a signed-in session without touching the developer's daily browser

The obvious-looking approach — attach to whatever Chrome window the developer
already has open — does not work as a zero-setup action. Chrome and Edge both
refuse to open a second process against a profile that is already running:
a `--remote-debugging-port` flag added to a new launch is silently ignored if
that profile's browser is already open, and the running window is focused
instead. Reaching the developer's everyday window over CDP would therefore
require closing it first, which is disruptive enough (other tabs, other work)
that it cannot be the default.

Instead, the extension keeps its **own dedicated Chrome/Edge profile**,
launched with `--remote-debugging-port` from the moment it is first created,
under the extension's storage directory
(`context.globalStorageUri` — never inside a task's own folder). The first
time a developer presses **Fetch from browser**, that profile has no Jira
session yet, so the window that opens shows the organisation's SSO prompt —
the same one they use everywhere else, so it is normally one click, not a
password. That browser process is left running (detached) afterwards, so every
fetch in the rest of the VS Code session reuses the same profile's cookies:
CDP opens and closes a background tab in the already-running window without
bringing it to the front, so a warm fetch causes no new window and steals no
focus — though the window from that first sign-in is still there, sitting in
the background, unless the developer closes it themselves.

This is the sense in which the session is "the browser they're already
signed into" — the SSO flow is identical to the one they use daily, and nothing
new needs registering or approving with an identity provider — while being
honest that it is a second, extension-owned browser instance rather than a
literal read of whatever tab happens to be focused right now.

### The fetch itself

- `src/browser/CdpSession.ts` finds or launches the dedicated profile's
  browser, connects over CDP (`chrome-remote-interface`), opens a new target,
  navigates it to the ticket URL, waits for the page to settle, evaluates a
  script in the page to pull out the fields the extractor needs, then closes
  the target. The browser process itself is left running between fetches.
- The ticket URL is `<jiraBaseUrl>/browse/<epicKey>`, where `jiraBaseUrl` comes
  from the new `aiDevWorkflow.jiraBaseUrl` setting. An unset setting is a field
  error, worded the same way `NOT_CONFIGURED_MESSAGE` is in
  [Section 16](16-external-content.md) — naming the setting and where to set
  it.
- `src/browser/JiraExtractor.ts` isolates the DOM selectors that know what a
  Jira ticket page looks like today, so a future Jira UI change is a change to
  one file rather than to the fetch pipeline.

### Where the result lands

The fetched text is carried on `SetupSelection` as a new field, `epicContext`,
alongside `epic` — set once, at Setup time, and never re-derived by the engine
itself. It flows into `TaskState.inputs` conditionally, the same way
`featureStory` already does (not as a new top-level `TaskState` field the way
`epic` and `platform` are) — so `{{task.epicContext}}` is usable from a prompt
template with no further change, via the existing fallback in
`resolveValue` ([Section 6](06-workflow-schema.md)) that reads an unrecognised
`task.<name>` straight from `inputs`.

Landing it in `inputs` is not enough by itself to prefill a field, though:
`CollectRequirement`'s story field would still render empty on first view,
because the value a step shows comes from what the developer has typed or
what the step already answered, never from `inputs` directly. `TaskType`
gains a third source, `TaskView.initialValues`, lowest priority under both —
`CollectRequirement` sets `initialValues: { story: ctx.inputs.epicContext }`
when it is set, and that is what `StepDescriptor.ts` actually merges into the
step's `values` on the one render where nothing else has supplied one yet.

The field keeps `provider: 'manual'`: this is a starting value, not a new
provider, and D5's distinction between "free entry" and "a provider turns the
field into a selection" is untouched — a fetched value is still free text the
developer can edit before it is used in any prompt.

### The renderer contract gains a field action

Today `RenderField` (`webview/render/fields.ts`,
[Section 9](09-renderer-contract.md)) has no way to put a button beside one
specific field — only whole-step and whole-footer actions exist. This section
adds one optional property:

```typescript
export interface RenderField {
  // ...
  /** A single button drawn inline beside the field. Fires like any other action. */
  action?: { id: string; label: string }
}
```

Deliberately generic: the renderer draws whatever `action` a field carries and
fires `onAction(action.id, values())` exactly as `step.actions` do — it does
not know that `fetchEpic` means "talk to a browser," any more than it knows
what `start` or `browse` mean elsewhere in the sidebar. `SetupView` is the only
place that gives `fetchEpic` meaning, which keeps invariant 1 in
[Section 5](05-architecture.md) intact.

## Failure modes

Every failure is a field error on `epic`, never a silent empty fetch — the
manual textarea underneath remains fully usable regardless:

| Cause | Message |
|---|---|
| Setting unset | Naming `aiDevWorkflow.jiraBaseUrl` and where to set it, matching the [Section 16](16-external-content.md) wording convention |
| Neither Chrome nor Edge found on the machine | States which two browsers were looked for |
| Ticket page redirects to a Jira login screen, and the developer signs in within the wait | No failure — see *Waiting for sign-in* below |
| Ticket page redirects to a Jira login screen, and the wait times out | "Still not signed in after 5 minutes — sign in on the browser tab, then press Fetch again" |
| Epic key not found (404 from Jira) | Quotes the key typed |
| CDP connection or navigation times out | States the timeout and that the manual field still works |

### Waiting for sign-in

A login redirect is not treated as an immediate failure. The tab is brought
to the front — deliberately left open rather than closed, so there is
something to actually sign in on — and the fetch then waits, polling the
tab's URL, for the developer to complete sign-in: bounded (five minutes by
default), so a developer who never signs in does not hang the sidebar
forever, but long enough that clicking **Fetch from browser** and then
signing in normally completes the same fetch with no second click.

If sign-in happens before the timeout, the fetch re-navigates to the ticket
(Jira's own `continue=` redirect after login normally lands there already;
re-navigating is cheap and removes any doubt) and proceeds exactly as a
signed-in fetch always has. Only a wait that times out is reported as a
failure — the tab stays open either way, so a developer who takes longer
than five minutes can still finish signing in and press **Fetch from
browser** again.

## Consequences

- **A new runtime dependency.** `package.json`'s `dependencies` have held only
  `yaml` and `zod` since P1; that has been treated as a working constraint
  rather than a rule this spec ever stated (the
  [external-content plan](../plans/external-content/README.md) is the one
  place it was written down, as a constraint on that plan alone). This section
  is the first to spend it: `chrome-remote-interface`, a small CDP client with
  no bundled browser binaries of its own, chosen over Playwright/Puppeteer
  precisely because this feature attaches to a browser already installed on
  the developer's machine rather than shipping one.
- **A new setting**, `aiDevWorkflow.jiraBaseUrl`, alongside the five [Section
  16](16-external-content.md) already added.
- **Manual acceptance only.** Like the criteria in
  [`MANUAL-ACCEPTANCE.md`](../MANUAL-ACCEPTANCE.md) that need Copilot or a real
  workspace reload, this needs a real signed-in browser and cannot run in CI.
  The unit tier tests `CdpSession` and `JiraExtractor` against fakes.

## Relationship to P3 and the provider seam

[Section 3](03-phasing.md) scopes **P3** as "JIRA/Rovo/Confluence via MCP,
filling in the provider seam built in P1" — that is, a `JiraMcpProvider`
registered in `src/providers/registry.ts`, resolved through
`ProviderRegistry.get(name).options(field)`, turning a field into a
*selection* ([D5](04-decisions.md), [Section 5](05-architecture.md)). This
section is a different mechanism reaching a different outcome: no MCP, no
credentials to get approved, and the result is starting *text* for a field
that stays free entry, not a list of choices. It does not fill in P3, and P3
is not a prerequisite for it. The two can coexist: an organisation might get
this sooner because it needs no server-side approval, and adopt
`JiraMcpProvider` later for the epic→story listing D5 always intended.

**D10** in [Section 4](04-decisions.md) records this as a decision in its own
right, alongside D5 rather than inside it.
