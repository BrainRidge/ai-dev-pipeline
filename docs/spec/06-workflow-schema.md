# 6. Workflow schema

> Part of the [AI Dev Workflow Phase 1 design](README.md).

A workflow is one JSON file in `workflows/`, named `<id>_<major>_<minor>.json`. The filename
carries the id and the version — `researchTaskWorkflow_1_0.json` is `researchTaskWorkflow`
at `1.0` — so a version is impossible to forget and impossible to disagree with the file it
is in. When two versions of the same id are present the catalogue keeps the highest.

```json
{
  "schemaVersion": 1,
  "label": "Research Task",
  "initialStep": "requirement",
  "steps": {
    "requirement": {
      "stepType": "task",
      "taskType": "CollectRequirement",
      "documentation": "Paste the story exactly as it is written in JIRA …",
      "nextStep": "gitClone"
    },
    "gitClone": {
      "stepType": "commandExecution",
      "taskType": "gitClone",
      "documentation": "Lists the git commands to put each microservice on your base branch …",
      "nextStep": "aiHandoff"
    },
    "aiHandoff": {
      "stepType": "aiHandoff",
      "taskType": "invokeCopilot",
      "documentation": "Sends the composed prompt to Copilot …",
      "nextStep": "reviewAnalysis"
    },
    "reviewAnalysis": {
      "stepType": "manual",
      "taskType": "manualReview",
      "documentation": "The analysis opens in an editor tab. Read it, then approve …"
    }
  }
}
```

## A step can be given more than one prompt

An `aiHandoff` step may list prompt files, and they are composed ahead of its own
template:

```json
"aiHandoff": {
  "stepType": "aiHandoff",
  "taskType": "invokeCopilot",
  "prompts": ["/skills/java-expert.md", "/skills/security.md"],
  "documentation": "Sends the composed prompt to Copilot …"
}
```

The shape this exists for is: **a persona or skill prompt, then the functional
prompt built from the developer's answers.** One says who the model is being asked
to be and travels across many steps and workflows; the other says what to do here
and is the step's own template, found by convention as always. Neither is complete
without the other, and a real handoff will usually have several of the first.

**Order is meaningful, and it is why this list is composed *before* the template
rather than after.** A persona read after the task it applies to is a different
prompt. The files are composed in the order the workflow gives them, so the
broadest goes first.

**Names are relative to the prompts root, with or without a leading slash.**
`/skills/java-expert.md` and `skills/java-expert.md` mean the same file, and the
leading form is allowed because it is how a workflow author naturally writes a
path from the top of a folder. It is never a filesystem path: a rooted name is
confined to the prompts folder, so `/etc/passwd` looks for
`<promptsRoot>/etc/passwd` and finds nothing. `..` and genuinely absolute paths —
`C:\…`, a UNC share — are refused outright.

**Each file resolves like any other prompt**: the team's copy if they have one,
the bundled one otherwise, per file, with the same case guard
([Section 16](16-external-content.md)). Placeholders resolve in them too, so a
persona can be specific to the task without being duplicated per workflow. A
declared prompt that is not on disk is fatal — its text is part of what is being
asked, and composing without it would send a different prompt than the caption
claims.

**The name is validated when the catalogue loads**, not when the prompt is
composed, so a typo fails on a tool developer's machine rather than three steps
into somebody's task. Existence cannot be checked there, because the file may
live in a team's content folder that the catalogue knows nothing about.

### Why this is in the JSON when `include:` is in the frontmatter

Both compose extra markdown into part 1, and having two mechanisms needs
justifying. They have different owners and different positions, and the positions
follow from the owners:

| | Declared by | Where it lands | For |
|---|---|---|---|
| `prompts` on the step | the **workflow** author | before the template | personas and skills — who to be |
| `include:` in frontmatter | the **prompt** author | after the template | house rules — constraints on how |

A workflow author decides which steps get which persona, and should not have to
edit a persona file to add a step to it. A prompt author decides what their own
prompt leans on, and [Section 8](08-ai-handoff-step.md) gives the reasoning for
that living in the same file as `output:`. Collapsing the two would take one of
those decisions away from the person who owns it.

`documentation` is required and is not decoration: it is what the developer reads in the
panel to understand why the step exists. It is the workflow author's one channel to the
person following the workflow, and it is the reason a workflow file is worth reviewing.

## Traversal

Steps form a graph of forward edges. Each step names its successor with `nextStep`; a step
with no `nextStep` is terminal, and completing it completes the task.

`order` — the walk from `initialStep` — is computed once at load time. It exists because a
graph of forward edges cannot answer "what came before this", which Back, Revise and
"the artifact the previous step produced" all need.

`WorkflowCatalog` validates at load time and refuses the file otherwise:

- `initialStep` names a step that exists
- every `nextStep` names a step that exists
- no step is its own successor
- no step is stranded — every one is reached by the walk from `initialStep`
- the walk ends at a step with no `nextStep`, so the workflow can finish
- every `taskType` is registered, and its `stepType` agrees with the JSON's

All of these fail when the catalogue loads, never mid-task.

**Revise** is not an edge in the JSON. A `manual` step offers Revise, which reopens the step
before it in `order` and marks everything from there pending. Their answers are retained, so
they prefill on the way back through. The original design expressed this as `on_revise:
<stepId>` in the workflow file; deriving it from `order` removed a name that could be wrong
without anything noticing.

## Step types and task types

`stepType` describes how a step behaves. `taskType` names the class that implements it.

| `stepType` | Behaviour | Completes when |
|---|---|---|
| `task` | Renders typed fields and collects answers | Developer submits and host-side validation passes |
| `commandExecution` | Shows commands for the developer to run themselves | Developer marks them run |
| `aiHandoff` | Composes a prompt and hands it to Copilot Chat | Declared output file exists **and** developer confirms ([D9](04-decisions.md)), or confirmation alone where the step produces edits |
| `manual` | Opens an artifact in a normal editor tab | Developer selects Approve or Revise |
| `systemCheck` | Probes the machine for the tools the workflow needs | No required tool is missing, and the developer continues ([Section 17](17-system-check.md)) |

| `taskType` | `stepType` | What it does |
|---|---|---|
| `systemCheck` | `systemCheck` | Reports which of the team's tools are installed |
| `CollectRequirement` | `task` | The story and the meeting notes behind it |
| `gitClone` | `commandExecution` | Plans the git commands to put each selected repository on the base branch |
| `invokeCopilot` | `aiHandoff` | A handoff contracted to write a file |
| `invokeCopilotCoding` | `aiHandoff` | A handoff that edits repositories |
| `invokeCopilotCodeReview` | `aiHandoff` | A handoff that reviews the diff it just produced |
| `manualReview` | `manual` | Opens the nearest artifact produced behind this step |

Field types available to a `task` step: `text`, `textarea`, `select`, `multiselect`,
`boolean`, `repo-picker`, `file-picker`.

`prompts` is available on any step, and means something only to `aiHandoff` ones — they are
the steps that compose a prompt. No bundled workflow declares any yet: the capability is
there so personas can be added as they are written, without a release that touches
TypeScript.

This catalogue is deliberately minimal. New types are added only when a workflow genuinely
cannot be expressed, and each addition is one new class plus, at most, one renderer branch.

## `commandExecution` plans; it does not run

`gitClone` composes the commands and shows them, with Copy and Send-to-terminal beside each
repository. It executes nothing. Sending to a terminal pastes at the prompt without a newline,
so the developer presses Enter themselves.

The trade is explicit and was made deliberately. The extension can no longer report which
clone failed or why, because it never sees the output — a step reports success because the
developer said so. What it keeps is that everything touching a real repository is the
developer's own act, and the audit log still records exactly which commands were put in front
of them. The original design had this step run clone and checkout and complete when every
operation exited 0.

The plan is rebuilt on every render, so cloning a repository by hand and returning shows that
block in its already-cloned form: `git -C … fetch origin` rather than `git clone`.

**Every line is a plain git invocation against a quoted absolute path**, and that is a
correctness requirement rather than a style. The plan used to open with `mkdir -p` and `cd`,
which are POSIX idioms: `mkdir -p` means something else in PowerShell, and a Windows path
built by Node's `join` and pasted unquoted into Git Bash has its backslashes eaten as escape
characters. So the emitted block was unusable in at least one shell on the platform half a
team may be working on, and nothing in the tool could notice — it never sees the output.

`git -C` removes the need to `cd`, and `git clone` creates the leading directories of the
path it is given, which removes the need to `mkdir`. What is left runs unchanged in bash,
zsh, PowerShell and cmd, and is three lines per repository instead of six.

## The bundled workflows

| File | Id | Label | Steps |
|---|---|---|---|
| `researchTaskWorkflow_1_0.json` | `researchTaskWorkflow` | Research Task | systemCheck → requirement → gitClone → aiHandoff → reviewAnalysis |
| `newFeatureWorkflow_1_0.json` | `newFeatureWorkflow` | New Feature | systemCheck → requirement → gitClone → aiHandoff → reviewAnalysis → CodeImplementation → CodeReview |
| `bugFixWorkflow_1_0.json` | `bugFixWorkflow` | Bug Fix | systemCheck → requirement → gitClone → diagnosis → reviewDiagnosis → CodeFix → CodeReview |

Every workflow opens on `systemCheck`. Nothing in the schema requires that — a
workflow may leave it out — but there is no reason to collect a requirement for
a task that cannot finish for want of a tool. See
[Section 17](17-system-check.md).

Bug Fix differs from New Feature in the one way a defect differs from a feature: it diagnoses
before it changes anything, the developer approves the cause rather than a plan, and the fix
step is required to write a failing regression test first.

Each workflow has one prompt template per `aiHandoff` step, found by convention at
`prompts/<workflowId>/<stepId>.md`. Nothing in the JSON names a template — see
[Section 8](08-ai-handoff-step.md). The template is looked for in the team's content folder
first and falls back to the bundled one per file ([Section 16](16-external-content.md)).

## Task-level inputs

Platform, epic, task type, base branch, work directory and microservices are collected once
in the sidebar before the workflow begins, and are readable by every step. No workflow
re-asks for them.

One workflow needs a field of its own: New Feature asks for a story key. That is a name in
TypeScript — `NEW_FEATURE_WORKFLOW_ID` in `src/session/SetupSelection.ts` — which the
config-driven design otherwise avoids, and it costs an edit and a release. The trade was
made deliberately; the alternative was letting workflows declare their task inputs in JSON,
which is the right answer if a third workflow ever needs a field of its own.

## Platform and microservice configuration

`config/platforms.json` lists the platforms and `config/microservices.json` is a flat list of
services with a short code, a name, a purpose, a git location and a category. Both come from
the team's content folder rather than from the extension — see
[Section 16](16-external-content.md) — and neither falls back to a bundled copy.
`examples/content-template/config/` holds the layout to copy.

A third file lives beside them: `config/tools.json`, the list of tools the
`systemCheck` step looks for. Unlike the two above it is optional and falls back
to a bundled default, because a default tool list names no repositories and so
cannot put anybody else's code on a developer's disk. See
[Section 17](17-system-check.md).

**Platform does not filter the microservice list.** It is recorded context — it goes into the
task state, the audit log and the prompt, and it selects nothing. The original design had
each platform carry its own service list; one flat catalogue turned out to describe the
organisation more honestly, since services are worked on across platform boundaries.

The repository folder a service lands in is derived from its git location the way git itself
derives it — the last path segment without a trailing `.git` — not from its short code. A
service whose git location yields no usable name is rejected when the catalogue loads, along
with duplicate short codes and duplicate derived folder names.

Epics are entered as free-text JIRA keys. A maintained epic list was rejected because it
would be stale within a week.

## Conditional steps were removed

The original design specified a `when:` expression on a step, with a deliberately minimal
grammar — one field reference, one operator, one literal — and required it to be implemented
in P1 on the grounds that retrofitting branching is costly.

It is not implemented and the syntax is not accepted. No bundled workflow needed it, and
carrying an untested expression evaluator to guard against a future cost is the kind of
speculative complexity the rest of this design refuses. If branching is needed, the cost of
adding it will be real rather than assumed, and the grammar rule above still stands when it
is: a workflow needing more logic than one comparison should be split into two workflows.
