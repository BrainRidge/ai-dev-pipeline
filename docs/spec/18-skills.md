# 18. Skills

> Part of the [AI Dev Workflow design](README.md).

A skill file in `prompts/skills/` now reaches Copilot two ways, and they are not
the same thing:

| | Composed into the prompt | Installed as an Agent Skill |
|---|---|---|
| Declared by | a step's `prompts` array ([Section 6](06-workflow-schema.md)) | nothing — every skill file is installed |
| Reaches the model | always, byte-exact | only when Copilot judges it relevant |
| In the audit log | in full, inside the prompt | the fact it was installed, not its use |
| Applies to | the one handoff | the whole conversation, including follow-up turns |

The second is the reason to bother. [D1](04-decisions.md) hands the work to
Copilot Chat and accepts that nothing past the handoff is auditable — which also
means nothing past the handoff is *influenceable*. A composed prompt shapes one
turn. An installed skill is still there three turns later when the developer is
arguing with the model about its second attempt, which is exactly where a
carefully written persona was previously wasted.

The cost is duplication. In a step that both composes a skill and has it
installed, Copilot may receive the same guidance twice. That is wasteful rather
than wrong, and it is the price of the guarantee: composition is the only path
that is certain, so it stays, and installation adds reach it never had.

## Where they go

`~/.copilot/skills/<name>/SKILL.md`. VS Code reads user-level skills from three
folders — `~/.copilot/skills/`, `~/.claude/skills/` and `~/.agents/skills/` — and
this writes to one of them, because writing to all three would install every
skill three times.

**This is the only thing the extension writes outside a task folder**, which is
worth stating plainly rather than leaving to be discovered. It is bounded: one
directory, one file per skill, contents derived entirely from the team's own
prompt files.

## The format is converted, not copied

A skill file in `prompts/skills/` is an ordinary prompt: frontmatter the
extension understands, then the text. An Agent Skill is a folder with a
`SKILL.md` whose frontmatter VS Code understands, requiring `name` and
`description`. So the file is read and a new one written.

```markdown
---
description: Reading an unfamiliar codebase to find out what it actually does.
  Use when investigating existing behaviour or tracing a call path.
---
You are reading an unfamiliar codebase…
```

becomes `~/.copilot/skills/codebase-analyst/SKILL.md`:

```markdown
---
name: codebase-analyst
description: Reading an unfamiliar codebase to find out what it actually does.
  Use when investigating existing behaviour or tracing a call path.
---
You are reading an unfamiliar codebase…
```

**`name` is derived from the filename**, the same convention prompt templates
follow: one source of truth, and renaming the file renames the skill. VS Code
allows lowercase letters, numbers and hyphens, so a file named otherwise is
reported rather than installed under a mangled name.

**`description` must be declared and is never guessed.** It is not a summary —
it is the trigger, the text Copilot matches on to decide whether a skill is
relevant. Deriving one from the first line of the body would quietly decide when
somebody's skill fires. A file without one is reported as not installable, and
the composed prompt still carries its text, so nothing is lost but the reach.

The same frontmatter is invisible to composition: `include:` and `prompts:`
already strip frontmatter before quoting a file ([Section 8](08-ai-handoff-step.md)),
so one file serves both consumers and neither sees the other's keys.

## What is allowed to overwrite what

The rule is [Section 16](16-external-content.md)'s, unchanged, applied to a
folder instead of a settings file:

> A file is ours to update only if it is absent, or still holds exactly what we
> last wrote there.

What was last written is remembered per skill, in global state rather than
workspace state, because the skills folder is the developer's own and is the same
one whichever repository they have open. A skill somebody has tuned therefore
survives every later install, and is reported as *yours — left alone*, with the
note that deleting it takes the team's version again.

This matters more here than it did for settings. A silently reverted skill would
change how the model behaves, days later, in a way nobody would think to connect
to having opened a task.

## When it happens, and what it never does

Installation is part of the check, so that by the time the step is on screen it
is done and the report can say so. It runs once per session and is idempotent —
a second render writes nothing.

**It never blocks the step.** Every skill could fail to install and the workflow
would still work, because the composed prompt carries the same text regardless.
So every failure is a finding: a bad name, a missing description, unparseable
frontmatter, a file the developer has edited, a VS Code too old to load skills at
all. One unparseable file costs its own line in the report and nothing else,
which is the same rule [Section 7](07-run-state-and-persistence.md) applies to an
unreadable task folder.

## What the developer sees

```
1. Tools on this machine

Copilot agent mode  ✓  enabled
Git                 ✓  2.50.1
…

2. Skills available to Copilot

codebase-analyst  ✓  installed
evidence-first    ✓  installed

Installed to /Users/you/.copilot/skills
```

The path is absolute so it can be gone and looked at. The step result records the
directory and every finding, so a session log can answer which skills a team's
machines actually have.

## Version

Agent Skills arrived in VS Code 1.108. Below that the folders are not read, so
installing into them would be a lie told in a report. The version is checked and
the section says so instead — the same treatment `chat.agent.enabled` gets when
the setting does not exist ([Section 17](17-tool-check.md)): a check that cannot
be made must not become a verdict.

The extension's own floor is 1.96, so this is a capability a developer may
genuinely not have. That is why nothing depends on it.

## What this deliberately does not do

- **It does not install workspace skills** (`.github/skills/`). Those belong to a
  repository and would land in the developer's git status.
- **It does not remove skills.** A skill deleted from the team's folder stays
  installed. Deleting files from a developer's home directory on the strength of
  a config change is a larger promise than this feature needs to make, and the
  reverse — a stale skill — is visible in the report as one the team no longer
  supplies only if somebody looks. That is an accepted gap.
- **It does not check whether a skill was ever used.** Nothing past the handoff
  is observable, which is [D1](04-decisions.md) again.
