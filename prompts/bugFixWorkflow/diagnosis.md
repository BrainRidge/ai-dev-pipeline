---
output: 02-root-cause.md
---
You are diagnosing a defect. Do not fix anything in this step.
Platform: {{task.platform}}. Epic: {{task.epic}}.
The defect was reported against `{{task.baseBranch}}`.

## The defect, as written in JIRA

{{requirement.story}}

## Meeting notes from call or conversation

{{requirement.notes}}

## What to produce

Read the repositories in scope and find the cause. Structure your diagnosis
with exactly these headings:

1. **What actually happens** — the observed behaviour restated in terms of the
   code you have just read, not the language of the ticket.
2. **The path in** — the call path from the entry point to the point of failure,
   with file and line references at each hop.
3. **Root cause** — the specific line, condition or assumption that is wrong,
   and why it produces the reported symptom. Name it precisely: "the null check
   on line 84 runs after the dereference", not "error handling is weak".
4. **Evidence** — what in the code proves this is the cause rather than a
   plausible candidate. If you could not confirm it by reading alone, say what
   would confirm it: a log line, a value at a breakpoint, a test that fails.
5. **How to reproduce it in a test** — the smallest test that fails today
   because of this cause, and where in the repository it belongs.
6. **Blast radius** — everything else that depends on the code that must change,
   and what could break when it does.

Distinguish the cause from the symptom explicitly. If the shortest change that
makes the symptom disappear is not at the root cause, say both, and say which
one you recommend fixing and why. If the evidence does not support a single
cause, say so and list the candidates rather than picking one to sound decisive.
