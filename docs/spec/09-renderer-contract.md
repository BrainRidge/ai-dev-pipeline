# 9. Renderer contract

> Part of the [AI Dev Workflow Phase 1 design](README.md).

## Three-pane layout

An activity-bar container hosts a webview view (pane 1). The workflow panel occupies the
editor area (pane 2). Copilot Chat is requested into the secondary side bar on task start
(pane 3).

```
┌────┬──────────────┬───────────────────┬──────────────┐
│ 🤖 │ Task SetUp   │  Workflow UI      │ Copilot Chat │
│    │ new/existing │  step diagram     │              │
│    │ platform     │  detail pane      │  positioned, │
│    │ epic         │       [Continue]  │  not owned   │
│    │ task type    │                   │              │
│    │ base branch  │                   │              │
│    │ microservices│                   │              │
│    │ ─────────────│                   │              │
│    │ work dir     │                   │              │
└────┴──────────────┴───────────────────┴──────────────┘
```

**Pane 3 is positioned, not owned.** Copilot Chat is GitHub's view; no extension can host or
embed it. The extension executes a command to open it in the secondary side bar and tries a
short list of command ids for resilience across Copilot versions. The developer may move or
close it, and if Copilot is not installed nothing happens. This is a deliberate limit, not a
defect.

**Pane 1 has two modes.** New collects the task-level facts. Existing lists the unfinished
tasks under the tasks root and opens one where it stopped. The work directory sits below the
primary action, in a footer section, because it is a machine setting rather than a fact about
the task; its value travels with every action so the host always sees the whole form.

## The middle pane is the whole workflow, not a single step

The panel renders the **entire workflow definition** on load, as a horizontal diagram of
nodes with a detail pane below for the selected one, so a developer sees the journey from
step 1 rather than only where they happen to be.

```
 ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
 │ 1 INPUT ✓│──▶│ 2 COMMAND│──▶│ 3 COPILOT│──▶│ 4 REVIEW │
 │ Collect  │   │ Get the  │   │ Hand off │   │ Review   │
 │ the req. │   │ code     │   │ to Copilot│  │ the result│
 └──────────┘   └──────────┘   └──────────┘   └──────────┘
 ──────────────────────────────────────────────────────────
  3. Hand off to Copilot                          [COPILOT]
  <the step's documentation, from the workflow JSON>
  <fields, or command blocks, or the composed prompt>
                                    [Send to Copilot] [Done]
```

- Completed steps show a one-line summary and offer **Edit**.
- The active step shows its fields, prefilled from what the developer has typed or, failing
  that, from stored answers.
- Pending steps are visible but dimmed — visible ahead, not skippable.
- Selecting a node is a view concern handled entirely in the webview. It never round-trips.

**Badges are derived, not declared.** `COMMAND`, `COPILOT` and `REVIEW` come from the
`stepType`; `INPUT` versus `SELECT` comes from whether a step's fields offer fixed choices.
Workflow authors never write them.

**Editing an earlier step** reopens it and marks it and everything after it `pending`,
because later steps were answered on the basis of what it said. Their answers are retained so
they prefill on the way back through.

This raised the protocol to **version 2**: the descriptor carries every step with its type,
status and summary, rather than only the active step.

**Both panes use the same renderer and the same `WebviewBridge`.** The sidebar is a single
step descriptor with its own actions. Its only sidebar-specific glue is asking the host to
redraw when a choice changes, because which fields the form offers depends on the answers —
and note what it does *not* do: decide which task type needs which field. That stays on the
host, so the renderer knows no workflow by name.

## Workflow descriptor

```json
{
  "protocolVersion": 2,
  "task": { "id": "PLAT-1234-researchTaskWorkflow-20260814-01",
            "platform": "canada-assisted", "epic": "PLAT-1234",
            "workflowLabel": "Research Task" },
  "activeStepId": "aiHandoff",
  "steps": [
    { "id": "requirement", "index": 1, "title": "Collect the requirement",
      "stepType": "task", "badge": "INPUT", "status": "complete",
      "documentation": "Paste the story exactly as it is written in JIRA …",
      "summary": "why is checkout slow",
      "answers": [ { "label": "JIRA story acceptance criteria as is",
                     "value": "why is checkout slow" } ],
      "actions": [ { "id": "edit", "label": "Edit" } ] },

    { "id": "aiHandoff", "index": 3, "title": "Hand off to Copilot",
      "stepType": "aiHandoff", "badge": "COPILOT", "status": "current",
      "documentation": "Sends the composed prompt to Copilot …",
      "text": "Read the prompt below — edit it if you want to — send it to Copilot …",
      "commands": [ { "id": "prompt", "label": "Composed prompt",
                      "lines": [ "You are helping a developer research …" ],
                      "editable": true,
                      "actions": [ { "id": "copy", "label": "Copy" },
                                   { "id": "send", "label": "Send to Copilot" } ] } ],
      "values": {},
      "actions": [ { "id": "send", "label": "Send to Copilot" },
                   { "id": "done", "label": "Done", "primary": true } ] }
  ]
}
```

`actions` are declared by the host, on the step and on each command block. The renderer
contains no per-type button logic, which is what allows new step types to be added without
frontend changes. A command block is a slab of text the developer acts on by hand — git
commands, or a prompt. If it is `editable` the renderer draws a textarea instead of a
read-only block and returns its contents, keyed by block id, with every action from that step.

## Messages

| Direction | Message | Payload |
|---|---|---|
| host → webview | `render` | descriptor |
| host → webview | `progress` | `{ stepId, message }` |
| host → webview | `error` | `{ stepId, message, recoverable }` |
| webview → host | `ready` | — |
| webview → host | `action` | `{ stepId, actionId, values }` |

`protocolVersion` is checked on every `render`. A mismatch shows a reload prompt rather than
failing unpredictably — necessary because extension versions will drift across the team
([D7](04-decisions.md)).

A webview's script loads asynchronously, so a `render` posted immediately after the HTML is
set arrives before anything is listening. `WebviewBridge` keeps the latest descriptor and
flushes it when the webview announces itself with `ready`.

**What an owner does when its view is hidden depends on whether the view is retained**, and
getting that wrong is not a cosmetic bug.

| | Sidebar (`WebviewView`) | Panel (`WebviewPanel`, `retainContextWhenHidden`) |
|---|---|---|
| When hidden | discards its DOM | keeps DOM, script and state |
| On return | script reloads, sends `ready` again | sends nothing — it never left |
| Owner does | `resetReady()` on hide | `flush()` on show |

The panel used to call `resetReady()` on hide, borrowed from the sidebar. Because the panel is
retained it never sends a second `ready`, so the flag stayed false and **every later `render`
was stored and never posted** — the panel froze on whatever step it was showing, permanently,
and no action could unfreeze it.

What made that reliably reachable rather than an edge case: a `manual` step opens its artifact
in an editor tab, which is the one thing the tool does that puts a document over its own panel.
So the freeze happened exactly when the developer pressed Done and moved to a review step. The
state advanced, the artifact opened, and the panel went on drawing the previous step — which
reads as Done doing nothing but opening a file.

Two changes, either of which would have been enough, and both are worth having. The panel
replays on show instead of silencing on hide. And a `manual` step opens its artifact with
`ViewColumn.Beside` and `preserveFocus`, so the panel is not covered in the first place and
keeps the focus the developer is about to press a button with.

A manual step also opens its artifact **once, on arrival** rather than on every render.
`refresh` runs for each progress message and each action, and reopening the document every time
drags the developer out of whatever they were doing in it.

`progress` and `error` prepend a banner and do not re-render, which is what lets a developer
copy or send an edited prompt without the box being rebuilt underneath them.

## Renderer non-responsibilities

- **No markdown rendering.** A `manual` step opens the real file in a real editor tab. The
  panel shows the title and the action buttons. This is why editing a generated MD file works
  with no additional implementation.
- **No command execution.** The renderer draws the lines it is given and reports which block
  was asked for. The host owns the clipboard and the terminal.
- **No persistence.** No `localStorage`, no disk writes. Destroying the webview loses nothing
  except text typed and not yet acted on.
- **Errors are shown whether or not a field claims them.** A message keyed to a field id is
  drawn under that input; anything else is drawn in a box above the step body. Without that
  second half, a step with no fields silently discarded every error it was given, which is
  precisely what made a refused Done look like a hang.
- **No authoritative validation.** Field constraints ride in the descriptor for immediate
  feedback, but the host revalidates every submission. The renderer is untrusted by design.

## Consequences

The renderer is written once and rarely reopened; adding workflows never touches it. Because
the descriptor is its only input, it can be developed and tested in a browser against fixture
files with no extension host running. The toolchain is TypeScript and esbuild with no
framework and no component library, styled with VS Code theme CSS variables so light, dark
and high-contrast themes work automatically and native form elements carry accessibility.

One caveat learned the hard way: **the sidebar and the panel do not share a stylesheet.** The
panel loads `out/style.css`; the sidebar carries its own inline block. A rule added to one
does not reach the other, and a blanket rule in the sidebar's block once made a new control
unusable while the panel's version of it looked fine.
