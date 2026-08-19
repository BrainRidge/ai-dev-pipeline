# 3. Phasing

> Part of the [AI Dev Workflow Phase 1 design](README.md).

| Phase | Contents | Status |
|---|---|---|
| **P1 (this spec)** | Workflow engine, workflow config format, webview renderer, platform/epic/task selection, and the **research** task type end to end including AI handoff and MD review | Shipped |
| P2 | Story development and bug fix task types; the code-review step and its approve → apply loop | **New Feature** and **Bug Fix** shipped; the approve → apply loop did not |
| P3 | Integration layer — JIRA/Rovo/Confluence via MCP, filling in the provider seam built in P1 | Not started |
| P4 | Logging and telemetry surface; org-wide packaging improvements | Not started |

The workflow config format and the provider seam are designed fully in P1 because they are
expensive to change later. Everything else in P2–P4 is intended to be additive.

## What actually happened to the phase boundary

Two of P2's task types arrived during P1, and the manner of their arrival is the useful
part: **New Feature** and **Bug Fix** were each added as one JSON file and a few markdown
templates, with no TypeScript. That is [acceptance criterion 11](14-acceptance-criteria.md)
demonstrated on real work rather than on a throwaway, and it is the strongest evidence the
tool has that [D6](04-decisions.md) was achieved.

The code-review step in P2's description meant something more than what shipped. What exists
is a handoff that asks Copilot to review its own diff and fix what it finds. There is no
approve → apply loop in which the extension holds proposed changes and applies them on
approval; nothing is staged, and the developer's own review of the diff remains the gate.

Everything else in P2–P4 remains unstarted.
