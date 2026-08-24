# 17. The Tool Check step

> Part of the [AI Dev Workflow design](README.md).

Every bundled workflow now opens on a step that checks the developer's machine
before anything else happens. It is the first step because the alternative is
discovering the problem later: a developer who pastes a story, selects six
services and reaches `gitClone` before finding out that git is not installed has
spent effort on a task that could never have finished.

## It costs nothing to run

The step makes no model call. Every answer comes from running a tool's own
version command and reading what comes back, which matters for two reasons.

The first is cost: this is a question asked at the start of every task by every
developer, and paying a model to answer it would be the most frequently repeated
waste in the tool.

The second is better. **Whether a tool is installed is a fact, not a judgement.**
A model asked whether Maven is present can only guess, or ask to run a command
and then report what it thinks the output means. Spawning the process directly is
faster, deterministic, and the answer is not a claim the developer has to trust.
That is the same reason `gitClone` plans rather than interprets, and it is why
this is a step type of its own rather than another `aiHandoff` with a cleverer
prompt.

## What it checks is the team's decision

The tool list comes from the team's content folder, at
`config/tools.json`, behind `aiDevWorkflow.toolsConfig` — with
`aiDevWorkflow.contentRoot` filling it in like the other three
([Section 16](16-external-content.md)).

This follows Section 16's line exactly. Which tools a developer needs is a fact
about a team's repositories, not about this extension: a Gradle shop and a Maven
shop need different lists, and a team on JDK 17 needs a different floor from one
on 21. One hardcoded list would serve exactly one team, which is the problem
Section 16 exists to solve.

**Unlike the two config files, it falls back.** A team that supplies no list gets
a bundled default — git, a JDK, Maven and Gradle — because unlike the
microservice catalogue, a default tool list cannot do any harm: it names no
repositories, clones nothing, and the worst it can do is ask about a build tool
the team does not use. The report says which list was used, so the fallback is
visible rather than silent.

**The fallback is whole-file, not per-file.** Prompt templates fall back one file
at a time, so a team overriding one prompt still receives every prompt a later
release adds ([Section 16](16-external-content.md)). A tool list cannot work that
way: merging the team's entries with the default's would mean a team that
deliberately removed Gradle from its list would get it back at the next release,
with no way to say no. A list is a statement about a whole machine, so it is
taken or left as one.

## The file

```json
[
  {
    "id": "git",
    "label": "Git",
    "command": "git",
    "args": ["--version"],
    "required": true,
    "minVersion": "2.30",
    "why": "The Get the code step gives you git commands to run yourself.",
    "install": {
      "darwin": "brew install git",
      "win32": "winget install Git.Git",
      "linux": "sudo apt install git"
    }
  }
]
```

| Field | Meaning |
|---|---|
| `id` | The key findings are reported and stored under. Two tools sharing one is a load error |
| `label` | What the developer reads in the report |
| `command` | The executable. Spawned directly, never through a shell |
| `args` | Defaults to `["--version"]` |
| `required` | Defaults to true. Only a required tool can block the step |
| `minVersion` | Optional. Dotted numbers, compared numerically segment by segment |
| `why` | Why this workflow wants it. Shown beside the tool when it is missing |
| `install` | A hint per `process.platform`, and only this machine's is shown |
| `platforms` | Overrides `command` and `args` per `process.platform`. Either key alone; a platform with no entry uses the values above |

`why` is not decoration, for the same reason `documentation` is not decoration on
a step ([Section 6](06-workflow-schema.md)): it is the tool list author's one
channel to the developer whose task has just been stopped. *"Copilot compiles and
tests the code it changes"* tells them whether the block is real. *"Java is
required"* tells them nothing they could not see.

## The machine it decided it was on

It is said twice, in the two places a developer actually reads: the sentence
under the step title, and the report's own label.

```
Checked on macOS. Everything this workflow needs is installed.

  ┌ Tool check on macOS ──────────────────
  │ Tool list: bundled default
  │ 1. Tools on this machine
  │ …
```

Not in the caption, which is where it started. That line is `.8em` grey text
meant for provenance — right for saying which prompt template composed something,
wrong for the fact that decides what the whole report means. The label above it is
bold and full size, and the sentence above that is ordinary body text.

The platform is not decoration. Which commands ran depends on the platform — through
`platforms`, through the Windows extension search below, and through which
`install` hint is shown — so a developer reading a surprising report cannot make
sense of it without knowing what the step decided they were on. It is recorded on
the step result too, as both the raw `process.platform` and the friendly name, so
a session log can say which machines a team actually works on.

**`platforms` is rarely needed, and that is deliberate.** It exists for a tool
that is genuinely a different program somewhere — a shell, a package manager, a
platform-specific runtime. It is *not* how Maven and Gradle are found on Windows:
`mvn.cmd` and `gradle.bat` are found without any entry, because the probe tries
those extensions itself. Reaching for `platforms` to solve that would put the same
knowledge in every team's tool list instead of once in the code.

## How a tool is probed

`command` and `args` are spawned with `execFile` and **no shell**, so nothing in
a tool list can be interpreted as a shell command. The list is team-owned content
like a prompt template, but a prompt template cannot execute — so the extra
distance is worth the one thing it costs, which is the next paragraph.

**On Windows, many development tools are batch shims rather than executables.**
Maven ships `mvn.cmd`; Gradle ships `gradle.bat`. Without a shell Node will not
find either, so the probe tries the suffixes itself — `""`, `.cmd`, `.bat`,
`.exe` — and takes the first that is not `ENOENT`. The list is empty on every
other platform, so POSIX spawns exactly once. Turning a shell on for a config
file's contents would have been the shorter fix and is not worth it.

Three details of reading the answer, each learned from a real tool:

- **stdout and stderr are both captured.** `java -version` writes to stderr.
- **A non-zero exit still counts as found**, provided the process ran. The
  question is whether the tool is on the machine, not whether it approves of its
  arguments.
- **A probe gives up after five seconds** and reports the tool as found with no
  readable version. A hung probe must not hang the panel.

## Reading a version is deliberately crude

The first run of dotted digits in the output is taken as the version.
`git version 2.50.1` yields `2.50.1`; `openjdk version "21.0.8" 2025-07-15`
yields `21.0.8`; `java version "1.8.0_392"` yields `1.8.0`, which correctly
fails a floor of 17.

The alternative is a parser per tool, in a list the extension does not own. So
the rule that keeps this safe is: **an unreadable or surprising version never
fails the check on its own.** A tool that answered is reported as installed. Only
a version that parsed *and* fell below a declared floor is reported as too old.
A team whose tool prints a copyright year first will see a wrong number in the
report; they will not see a working machine refused.

## What blocks, and why this one is allowed to

A required tool that is missing or below its floor stops the step. An optional
one never does, however many are absent.

This is the only hard gate in the tool that does not rest on the developer's
word, and it deserves the justification. Everywhere else — `gitClone` reporting
success because the developer said so, an editing handoff completing on
confirmation alone ([Section 8](08-ai-handoff-step.md)) — the extension cannot
independently know, so it asks and records the answer. Here it *can* know. The
step is not overruling a developer's judgement; it is declining to pretend a
task can finish when a tool it needs is provably absent.

Two consequences were accepted:

- **A tool installed somewhere the probe cannot see it reads as missing** — a
  corporate wrapper, a shell function, a PATH set only in an interactive
  profile. The escape hatch is the tool list itself: the team can point
  `command` at an absolute path, or mark the tool optional. There is no
  per-developer override, because one would be indistinguishable from opting out
  of the check.
- **A team can turn the gate off entirely** by marking everything optional. That
  is deliberate. The list is theirs.

The step fails closed: if it is asked to validate before it has run, it refuses
and says so rather than waving the task through unchecked.

## Re-check, and why the results are cached

`StepDescriptor` asks every step to describe itself on every render
([Section 5](05-architecture.md)), so a naive implementation would spawn four
processes each time the panel redrew. Results are therefore probed once and held
for the life of the session.

**Re-check** is how the developer says the machine has changed, and it is the
only thing that clears the cache. It is not a transition — like Copy on a
command block, it is an affordance on the current step. `WorkflowEngine.submit`
treats any action it does not recognise as a submission, so `TaskSession` routes
`recheck` and `copy` explicitly before that fall-through.

**Copy** puts the whole report on the clipboard. On a locked-down laptop the
developer often cannot fix their own machine, and the next thing they do is send
the report to somebody who can.

## The report

The report is rendered as an ordinary command block with no actions of its own,
which is why this step needed **no renderer change at all** — one badge colour in
the stylesheet, and nothing in `render/fields.ts`. That is the strongest
available evidence for [D6](04-decisions.md) since the two P2 workflows: a whole
new step type, and the frontend did not move.

```
Copilot agent mode  ✓  enabled
One-click handoff   ✓  workbench.action.chat.open is available
Git                 ✓  2.50.1
Java (JDK)          ✗  not found
Maven               –  not found (optional)
Gradle              ⚠  7.6 — needs 8.0 or newer

Java (JDK) — required
  Why      Copilot compiles and tests the code it changes.
  Install  brew install openjdk@21
```

## Provenance and audit

Both surfaces from [Section 16](16-external-content.md) extend to the tool list,
for the same reason: a silent fallback is only acceptable if it is visible
afterwards.

| Surface | What it carries |
|---|---|
| The panel | A caption above the report: the resolved list's path and whether it is `external` or the `bundled default` |
| The audit log | `toolsConfig` joins the `content-resolved` entry with its path and content hash, when the team supplied one; the step's own result records `toolsSource`, `toolsPath` and every finding |

The findings are recorded, not just the verdict. A month of task folders then
answers a question the tool could not answer before: which tool is missing on how
many machines, and which required entry in the list is stopping work most often.
An entry that blocks constantly is usually a list that is wrong rather than an
estate that is broken.

## Two checks that are not tools

The report opens with two things that are not programs on a PATH and are not
team-configurable:

| Check | Reads | Required |
|---|---|---|
| Copilot agent mode | `chat.agent.enabled` | Yes |
| One-click handoff | whether `workbench.action.chat.open` is registered | No |

They are built in rather than part of `config/tools.json` because they are not team facts.
Every team using this extension depends on Copilot agent mode — that is
[D1](04-decisions.md) — so there is nothing for a team to configure and no version of this
tool where the answer does not matter.

**Agent mode is required, and this is the gap [Section 8](08-ai-handoff-step.md) recorded from
P1 onwards.** The check was specified for P1, never implemented, and a developer with agent
mode off discovered it when Copilot answered in chat instead of editing files — several steps
into a task, after the requirement, the clone and the plan. It is required rather than advisory
because the implementation and review steps are contracted to produce edits, and with agent
mode off they produce conversation.

`chat.agent.enabled` defaults to true and arrived in VS Code 1.99. Three states, and the third
is the one that needed care:

- `true` — passes.
- `false` — blocks, with the likelier cause named: an organisation can disable agents, and then
  no amount of clicking in Settings will help.
- **`undefined`** — the setting does not exist in this version of VS Code, which is not the
  same as off. Reported as *could not be checked*, and it never blocks. A check that could not
  be made must not become a verdict; that is the whole reason `unknown` is a status of its own
  rather than being folded into one of the others.

**The one-click handoff is not required**, because the ladder degrades to the clipboard and
then to a file and both rungs work ([Section 8](08-ai-handoff-step.md)). Its absence costs a
paste per handoff, not a task, so the report says exactly that: *"Nothing breaks; each one
costs a paste."* Reporting it at all is worth doing because it is the difference between a
developer thinking the tool is broken and knowing it is degraded.

What neither check can establish is whether the chat session in front of the developer is in
agent mode *at that moment*. They can switch a session to Ask after the check passes, and no
extension can see that. This reduces the friction rather than removing it, which is the honest
end state for a design built on [D1](04-decisions.md).

## The second half: skills

The step reports on two things, numbered, because they answer different
questions: what is on this machine, and what Copilot has been given to work with.
The second half installs the team's skill files where Copilot will find them and
says what it did. It never blocks — see [Section 18](18-skills.md).

## What it deliberately does not do

- **It installs nothing.** Same reasoning as `gitClone`
  ([Section 6](06-workflow-schema.md)): everything that changes a developer's
  machine stays their deliberate act. The report gives the command; they run it.
- **It does not check VS Code or Copilot.** VS Code is running the code that
  would do the checking, and every developer with this extension has both. A
  check that can never fail is noise in a report whose value is that everything
  in it might.
- **It does not check the repositories.** Nothing is cloned yet at this point in
  the workflow, and nothing this step runs touches one.
- **It does not check that Copilot is installed.** If it were not, the chat command would not
  be registered, which the one-click check already reports — more precisely, and without a
  second thing to keep true.
