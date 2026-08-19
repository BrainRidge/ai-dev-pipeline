# 1. Context

> Part of the [AI Dev Workflow Phase 1 design](README.md).

The team already uses VS Code with GitHub Copilot across several models. Each developer
applies the AI-assisted development process differently, so output quality varies with the
individual rather than with the process.

This extension makes the process itself the product: a developer picks their platform, epic
and task type, and an interactive workflow guides them through a fixed sequence of steps —
gathering context, checking out code, handing a composed prompt to Copilot, and reviewing
the result. A new joiner or an intern follows the same path as a senior developer, and the
prompts that shape the AI's behaviour are written once by the people best placed to write
them.

## Organisational context

The team is divided across four platforms — Canada Assisted, Canada Self-serve, US Assisted,
US Self-serve. Within each platform, multiple teams work on multiple epics.

## Two roles, deliberately separated

Both roles are held by developers, which makes it easy to blur them. This design keeps them
strictly apart, and the terms below are used precisely throughout this document.

| Term | Who | Can change workflows? | How |
|---|---|---|---|
| **Tool developer** | The team that builds and enhances this extension | Yes | Edit JSON or a prompt template, open a pull request, ship in the next release |
| **Developer** | Someone who installs the extension in VS Code and uses it to do their work | **No** | No setting, command or editable file changes which steps run or in what order |

Throughout this document, **"developer" without qualification always means the person using
the extension**, never the team building it.

"Easy to configure and enhance" applies to tool developers only. A developer has no mechanism
to alter a workflow or its steps. That asymmetry is the whole point: it is what makes the
process standard rather than merely suggested.

One narrowing, added during implementation: a developer **can** edit a composed prompt in the
panel before sending it. The steps they must pass through are unchanged, and the audit log
records what was actually sent, but the wording of a given handoff is no longer fixed by the
release. See [Section 8](08-ai-handoff-step.md).

## Constraints

| Constraint | Consequence for this design |
|---|---|
| No team member is expert in Node or TypeScript; all are strong Java developers | OOP structure, one class per responsibility, small closed frontend, lint-enforced boundaries |
| The organisation does not support MCP today, but will | Provider seam designed now, implementations swapped later |
| Workflows must be changeable by developers, never by the extension's users | Workflows bundled in the extension repo, shipped as releases |
| AI interaction should be controlled and logged | Deterministic prompt composition and a full audit log up to the handoff boundary |
