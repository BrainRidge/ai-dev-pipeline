# 12. Verification tasks

> Part of the [AI Dev Workflow Phase 1 design](README.md).

Two implementation details were unverified when this design was written. Each had a decided
fallback, so neither blocked implementation.

| # | Question | Fallback if unavailable | Outcome |
|---|---|---|---|
| V1 | Does `workbench.action.chat.open` accept a prompt argument from an extension, and can agent mode be requested? | Handoff mechanism B, then C ([Section 8](08-ai-handoff-step.md)) | **Answered, and partly answered "no".** Which rung succeeds is now measurable from the audit log. Agent mode is now checked rather than requested. And the command turns out not to be a documented API at all — see below. |
| V2 | Is Microsoft's Webview UI Toolkit still supported? | Plain HTML with VS Code theme CSS variables — already the assumed default | **Resolved by taking the fallback.** The renderer is plain HTML and theme variables; the toolkit is not used and the question no longer matters. |

V1 is now answerable, and the reason it stayed open is worth recording: this section claimed
the answer "is already being collected on real tasks", and it was not. The mechanism reached
the step result in `_state.json` and never the audit log, and `_state.json` holds only the
current attempt — a revise loop overwrote it. Anybody who went looking for the evidence would
have found the question unanswerable however long they had waited.

Two things closed it:

- **A `prompt-delivered` audit entry**, written after `ChatHandoff` returns, recording which
  rung worked. Append-only, so a revise loop adds to the record rather than replacing it.
- **`AI Dev Workflow: Handoff Report`**, a command that reads every task folder under the
  tasks root and reports the distribution — along with which prompts came from a team template
  rather than the bundled default, which placeholders resolved to nothing, how many tasks ran
  on the sample catalogue, and how many workflow snapshots were edited mid-task. It opens as
  an untitled markdown document, because the person who needs the answer is usually not the
  person at the keyboard and a document can be pasted into a ticket.

The report states its own limit rather than overclaiming: a machine where mechanism A has
never failed says nothing about whether `mode: 'agent'` was honoured.

## The part of V1 whose answer is "the question was wrong"

V1 asked whether agent mode "can be requested" in the command's arguments. It cannot, in any
sense worth relying on: **`workbench.action.chat.open` does not appear in VS Code's built-in
commands reference.** It is an internal command, and its argument shape is not a public
contract — `query` is what everything observable suggests it reads, and `mode` is not
documented anywhere. So the design has been passing a property that may always have been
ignored, and this section's claim that the answer "is already being collected" was doubly
untrue: the mechanism was not in the log, and the thing being requested was not a parameter.

What closes it is a different mechanism. `chat.agent.enabled` **is** documented, defaults to
true, and is readable through ordinary configuration, so the System Check step reads it before
a task starts and refuses to continue while it is off
([Section 17](17-system-check.md)). Reading a setting is assurance; passing an argument to an
undocumented command is not.

What remains open, and now looks unclosable rather than merely unfinished: whether the chat
session the developer has in front of them is in agent mode at that moment. They can switch a
session to Ask after the check passes, and no extension can see that. The friction is reduced,
not removed — which is the honest end state for a design built on
[D1](04-decisions.md).
