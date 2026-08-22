# 16. External content

> Part of the [AI Dev Workflow design](README.md).

**Status:** Implemented. Extended by [Section 17](17-system-check.md), which adds a
fourth piece of external content on the same terms.

Phase 1 bundled every piece of content in the extension repository: the workflow
definitions, the platform and microservice catalogues, and the prompt templates. That is
[D2](04-decisions.md), and it bought the strongest form of standardisation available — a
developer cannot change the process because the process is not on their disk in any form
they can edit.

It also means one build serves exactly one team. A second team with different microservices
needs a second build, and a team that wants different prompt wording needs a release from
the team that owns the extension. This section relaxes D2 for the two kinds of content that
are genuinely team-specific, and leaves it intact for the one that is not.

## What moves, and what does not

| Content | Where it lives now | Required? |
|---|---|---|
| `workflows/*.json` | **Bundled, unchanged** | — |
| `config/platforms.json` | External | Falls back to the bundled sample |
| `config/microservices.json` | External | Falls back to the bundled sample |
| `prompts/<workflowId>/<stepId>.md` | External | Optional. Falls back per file to the bundled template |
| `config/tools.json` | External | Optional. Falls back as a whole to a bundled default ([Section 17](17-system-check.md)) |

The line is drawn where it is for a reason worth stating plainly: **workflows decide which
steps a developer must pass through, and that is what the tool exists to standardise.**
Config names the repositories an organisation actually has, and prompts are wording. A team
may need its own repositories and its own wording; letting it also choose its own steps
would leave nothing standard at all.

### The asymmetry that used to be here, and why it went

This section originally refused to fall back for `config/` at all: a missing prompt falls
back to a working default and the task proceeds, but a missing microservice catalogue "cannot
fall back to anything useful, because the bundled one would name repositories belonging to
somebody else, and the `gitClone` step would put those repositories on a developer's disk."

That reasoning was sound about the catalogue that *used to* ship, and it stopped being true
in the same change that wrote it. What ships now is `examples/content-template/config/`, whose
services point at `https://git.example.invalid/…` — a reserved TLD that cannot resolve. There
is no repository there for anyone to clone by accident, so the rule was protecting against a
danger its own replacement content had already removed.

What it cost was the whole first run. A developer who installed the `.vsix` and opened the
sidebar got a wall of text about a setting, before ever seeing what the tool does. That is
the worst possible moment to ask somebody to go and assemble a JSON file: they have no idea
yet whether the thing is worth configuring.

So the two catalogues now fall back to the bundled sample, and the rule that replaces the
asymmetry is narrower and about intent rather than about content:

> **Silence falls back. A path that cannot be a path is still an error.**

Nothing configured means a developer who has not got to it yet — give them something that
works. A relative path, a file that is not there, a catalogue with two services sharing a
`shortCode`: those are all somebody who tried, and telling them exactly what is wrong is the
most useful thing this loader does. Those states are unchanged.

The fallback is loud, because [the provenance rule below](#provenance) applies here as much
as it does to prompt templates — and harder, because the consequence is more surprising. A
developer who does not notice will select a service that cannot be cloned. So the sidebar
carries a banner for as long as the sample is in play, not a caption:

> ⚠ Using the bundled sample catalogue — placeholder services that cannot be cloned. Set
> Content Root to your team's folder to work on real repositories.

and the `content-resolved` audit entry records `source: "sample"` with the list of pieces
that fell back. A task started against the sample is a real task in every other respect; its
`gitClone` step will simply fail when the developer runs it, which is visible, harmless, and
happens at the developer's own hand.

**Falling back is per piece**, because each piece has its own setting. A team that has
configured a service catalogue but no platform list gets sample platforms and its own
services, and the banner still appears. Platform is recorded context that selects nothing
([Section 6](06-workflow-schema.md)), so there is nothing to be gained by being stricter
about it than about the catalogue that actually names repositories.

**Prompts and the tool list are not sampled.** Both already fall back on their own — to the
bundled templates ([Section 8](08-ai-handoff-step.md)) and to `DEFAULT_TOOLS`
([Section 17](17-system-check.md)). Only the two catalogues had nothing behind them.

## The settings

Five entries, ordered so the convenience comes first and the things it fills in follow.

| Setting | Expects | Required |
|---|---|---|
| `aiDevWorkflow.contentRoot` | A folder holding `config/` and `prompts/` | No — a convenience |
| `aiDevWorkflow.microserviceConfig` | A JSON file describing the microservices and their git locations | For real work |
| `aiDevWorkflow.platformConfig` | A JSON file listing the platforms | For real work |
| `aiDevWorkflow.customPrompts` | A folder of markdown prompt templates | No |
| `aiDevWorkflow.toolsConfig` | A JSON file listing the tools to check for | No |

Specific settings rather than one root, because the pieces are genuinely separate
concerns: a service catalogue is an organisational fact that several teams may share, and
prompt wording is a team's own. Naming them individually lets a team point at an existing
catalogue in a repository they already have, without reorganising anything to match a layout
this extension invented.

The content root remains because setting three paths that all live under one folder is
tedious, and that is the common case.

**Every path must be absolute.** A relative one would resolve against whatever working
directory the extension host happened to start in, which is not predictable — the same
reasoning that already applies to the work directory in `SetupSelection.isAbsolutePath`,
which this reuses.

Being ordinary VS Code settings, they inherit both scopes at no cost: an individual sets them
in User settings, and a team commits them to a repository's `.vscode/settings.json` so that
everyone working in that repository resolves the same content. The second is the intended
use. Nothing enforces it, in the same spirit as [Section 7](07-run-state-and-persistence.md)
— this is detection and convention, not prevention, because every user is a developer with
full filesystem access.

## Setting the content root writes the others

When `contentRoot` changes, the extension writes the derived paths into the specific
settings, so a developer sees what is in effect rather than three empty boxes and a rule they
have to know. The values go into the same scope the content root was set in, so a
workspace-level root fills workspace-level paths.

Writing into somebody's `settings.json` is unusual, and VS Code offers no undo for it. One
rule makes it safe:

> A field is overwritten only if it is empty, or still holds exactly what the extension last
> wrote there.

The extension remembers what it wrote, per scope. A `customPrompts` somebody has since
pointed at a shared prompts repository is theirs, and survives every later change to the
content root. Without that rule this feature would introduce precisely one bug — a
hand-picked path silently reverting — and it would be a confusing one.

**Reading never depends on the write having happened.** Each specific setting wins if it is
non-empty; otherwise the path is derived from the content root on the spot. So editing
`settings.json` by hand works, and a failed or skipped write costs nothing.

## Layout

```
<contentRoot>/
├── config/
│   ├── platforms.json           required
│   ├── microservices.json       required
│   └── tools.json               optional, whole-file fallback
└── prompts/
    ├── <workflowId>/
    │   └── <stepId>.md          optional, per file
    └── _shared/
        └── *.md                 optional, per file — pulled in with include:
```

Anything under `prompts/` resolves the same way, not just a step's own template: a file a
template pulls in with `include:` or `reference:` ([Section 8](08-ai-handoff-step.md)) gets
the same per-file fallback and the same case guard. So a team may override
`_shared/house-rules.md` alone and still receive every other shared file a later release
adds.

The layout mirrors the extension repository so that a team bootstraps by copying a folder
rather than by reading this document. `examples/content-template/` ships inside the `.vsix`
for exactly that purpose.

A `workflows/` directory inside the content root is **not** loaded — workflow definitions
stay bundled, as above. Because a team may reasonably expect otherwise, its presence is
reported as a warning naming this section rather than ignored in silence.

The file formats are unchanged. `platforms.json` and `microservices.json` are validated by
the same zod schemas and the same `validateMicroservices` rules as before; prompt templates
are the same markdown with the same optional `output:` frontmatter described in
[Section 8](08-ai-handoff-step.md).

## Resolution

Three states, deliberately distinguished, because "you have not configured this" and "you
have configured this wrongly" call for different responses from the developer reading the
message. Each names the specific setting at fault rather than the content root, because that
is the field they have to go and fix.

| State | Behaviour |
|---|---|
| Nothing configured for a piece | The bundled sample is used, and the sidebar carries the banner above for as long as it is. The message in the row below is still what a build with no sample on disk would say |
| A relative path | *"`aiDevWorkflow.microserviceConfig` must be an absolute path. Got `…`."* — quoting what was given |
| Configured, but the file is missing | *"Microservice config not found at `<resolved path>`"* — naming the path that was actually looked at |
| Present but invalid | The underlying validation error, verbatim |

The last row is not a detail. `validateMicroservices` already produces precise, actionable
errors — a duplicate `shortCode`, a `gitLocation` with no repository name, two services that
would clone into the same folder and overwrite each other. Those errors were previously
raised on a tool developer's machine at build time. They will now be raised on a team
member's machine at load time, which makes reaching the developer intact more important
rather than less. Flattening them into a generic "please configure" message would discard
the most useful thing the catalogue loader does.

**A badly configured prompts folder stops the task too**, even though a missing one does not.
Carrying on with the bundled prompts when the developer has plainly tried to supply their own
is the silent fallback this whole design exists to avoid.

A task cannot be started while any of the last three states is unresolved — the first is no
longer one of them. This is not new machinery:
`validateSetup` already requires a platform and at least one microservice, and neither can be
selected from an empty list. What is new is that the developer is told why, and which setting
to fix.

## Prompt fallback, and the one case it must not hide

A template absent from the external folder resolves to the bundled one. A team overriding a
single prompt therefore maintains a single file, and every prompt the extension adds in a
later release reaches that team without any action on their part. This is the whole benefit
of falling back per file rather than per directory.

It hides exactly one mistake, and it is a likely one: a template named `aiHandoff.MD` when
the step is `aiHandoff`. On a case-insensitive filesystem — the macOS default — that
resolves and the team's prompt runs. On a case-sensitive volume it does not, and the team
silently gets the bundled prompt while believing otherwise.

Therefore: **if the external `prompts/<workflowId>/` directory exists and contains a file
that matches the expected name only when case is ignored, that is an error rather than a
fallback** — *"found `aiHandoff.MD`, expected `aiHandoff.md`"*. Plain absence still falls
back silently, which is the intended path.

This error surfaces at prompt composition rather than at task start, and it therefore rides
the path [Section 8](08-ai-handoff-step.md) already established: composition failure is
returned rather than thrown, and the descriptor shows the error on the step that owns the
broken template instead of taking down the panel.

This was the same class of failure as the unresolved placeholder in
[Section 8](08-ai-handoff-step.md), which used to render as empty and be caught by nothing.
Repeating it in a new feature, when the guard costs a directory listing, would not have been
defensible — and the older regret has since been closed too: an unresolved placeholder is now
named in the caption above the prompt.

## Provenance

Silent fallback is only acceptable if it is visible afterwards. Two surfaces:

| Surface | What it carries |
|---|---|
| The panel | A caption above each composed prompt: the resolved template path, and whether it is `external` or the `bundled default` |
| The audit log | A `content-resolved` entry at task start giving the resolved `contentRoot` and the path and content hash of each config file; and `templatePath` and `templateSource` added to the existing `prompt-composed` entry |

The audit log's guarantee is unchanged in kind. It has always answered *what was asked*; it
now also answers *whose template asked it*.

## Prompts are not snapshotted

A task snapshots its workflow definition at start ([D8](04-decisions.md)) so that a release
mid-flight cannot change the steps underneath it. Prompts have never been snapshotted, and
they will not be now.

The reasoning is that external prompts make mid-task edits considerably easier than bundled
ones ever were, so this is a genuinely new drift vector — but the audit log already records
the exact prompt **as sent**, byte for byte, which is the question the log exists to answer.
Adding the template's path and hash to that record makes drift traceable. Building a second
snapshot mechanism to protect a guarantee the audit log already provides would be machinery
for its own sake.

The accepted cost: two runs of the same step in the same task may be composed from different
templates, and only the audit log will show it.

## Consequences for D2 and criterion 13

[D2](04-decisions.md) is narrowed, not withdrawn. Workflow definitions remain bundled in the
extension repository and remain changeable only by pull request and release. The claim D2
made about config and prompts no longer holds.

[Criterion 13](14-acceptance-criteria.md) — *a developer has no way to alter a workflow* —
narrows for the second time. It already excluded prompt wording, because a composed prompt
is editable in the panel ([Section 8](08-ai-handoff-step.md)). It now reads:

> A developer cannot change **which steps run, or in what order**. They can change the
> service catalogue and the prompt templates their team's content folder supplies, and they
> can edit a composed prompt before sending it. Tampering with a task's workflow snapshot is
> still detected and logged.

What survives is worth naming, because it is the part the tool was built for: every developer
on a team passes through the same steps in the same order, and every step's prompt is
composed deterministically from a template the team reviewed, rather than typed from memory
into a chat box.

What is given up is that the team owning the extension no longer knows what any given team's
prompts say. That was previously guaranteed by construction. It is now a matter of whether
the team keeps its content folder under review — which is why the layout is a git repository
in the intended use, and why the audit log records which template ran.

## Bootstrapping

The bundled `config/` directory is removed. Its contents move to
`examples/content-template/`, with the sample services replaced by obviously non-functional
placeholders, and it ships inside the `.vsix` so that a team can copy it out of an installed
extension.

That directory now does double duty: it is both the layout a team copies and what an
unconfigured install runs on. Those two jobs pull in the same direction — a sample worth
falling back to is a sample worth copying — but they do impose a rule on its contents.
**Every `gitLocation` in it must stay unresolvable.** The moment one names a real repository,
the danger this section originally worried about is back, and it is back on the first run of
every fresh install.

`prompts/` remains bundled in place. It is the fallback, and it must stay good.

## Packaging

`config/` must stop shipping and `examples/` must start. Nothing currently controls either:
there is no `.vscodeignore`, despite [Section 10](10-repository-layout.md) stating that one
excludes everything outside `out/`, `workflows/`, `config/` and `prompts/`. One is added as
part of this change, and Section 10 is corrected to match.

## Documents this change invalidates

Correcting these is part of the work, not a follow-up. Each currently states that config and
prompts live in the extension repository.

| Document | Correction |
|---|---|
| [4. Decisions](04-decisions.md) | D2 narrowed, in the existing departures style |
| [6. Workflow schema](06-workflow-schema.md) | The platform and microservice configuration subsection |
| [8. The AI handoff step](08-ai-handoff-step.md) | Templates are found by convention under the content root, not under the extension |
| [10. Repository layout](10-repository-layout.md) | `config/` removed, `examples/` added, `.vscodeignore` now real |
| [14. Acceptance criteria](14-acceptance-criteria.md) | Criterion 13 narrowed as above; new criteria for the three resolution states |
| [MANUAL-ACCEPTANCE.md](../MANUAL-ACCEPTANCE.md) | Already stale — corrected, and gains checks for the unconfigured, missing and invalid states |
