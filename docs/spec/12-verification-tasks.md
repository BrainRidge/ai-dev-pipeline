# 12. Verification tasks

> Part of the [AI Dev Workflow Phase 1 design](README.md).

Two implementation details were unverified when this design was written. Each had a decided
fallback, so neither blocked implementation.

| # | Question | Fallback if unavailable | Outcome |
|---|---|---|---|
| V1 | Does `workbench.action.chat.open` accept a prompt argument from an extension, and can agent mode be requested? | Handoff mechanism B, then C ([Section 8](08-ai-handoff-step.md)) | **Still unverified.** The ladder is built and the fallbacks work, so nothing is blocked — but which rung succeeds in practice, and whether `mode: 'agent'` is honoured, has not been established. |
| V2 | Is Microsoft's Webview UI Toolkit still supported? | Plain HTML with VS Code theme CSS variables — already the assumed default | **Resolved by taking the fallback.** The renderer is plain HTML and theme variables; the toolkit is not used and the question no longer matters. |

V1 is worth closing. The mechanism is recorded on every handoff and in the audit log, so the
answer is already being collected on real tasks — a session log will show whether A is
succeeding. The part that is not collected is whether agent mode was actually granted, which
is the same gap as the missing agent-mode check in [Section 8](08-ai-handoff-step.md).
