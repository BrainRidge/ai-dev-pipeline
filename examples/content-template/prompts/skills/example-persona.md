REPLACE ME. This file is an example of a *persona* or *skill* prompt: it says who
the model is being asked to be, and it is composed ahead of whatever the step
itself asks for.

A workflow step opts into it by name:

    "aiHandoff": {
      "stepType": "aiHandoff",
      "taskType": "invokeCopilot",
      "prompts": ["/skills/example-persona.md"],
      "documentation": "…"
    }

Real ones tend to say things like: what kind of engineer to be, which parts of a
codebase to treat as authoritative, which conventions matter here and which are
somebody else's taste, and what to do when the answer is genuinely unclear.

Two things worth knowing while you write them:

- **Order is meaningful.** The files listed in `prompts` are composed in the
  order given, ahead of the step's own template. Put the broadest first.
- **Placeholders work here too.** `{{task.platform}}`, `{{task.epic}}` and any
  answer from an earlier step resolve in this file exactly as they do in a step
  template — so a persona can be specific to the task without being duplicated
  per workflow.

See [spec Section 6](../../../../docs/spec/06-workflow-schema.md) for the
attribute and [Section 8](../../../../docs/spec/08-ai-handoff-step.md) for where
this text lands in the composed prompt.
