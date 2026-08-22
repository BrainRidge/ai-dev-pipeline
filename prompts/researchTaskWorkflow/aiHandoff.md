---
output: 02-analysis.md
---
You are helping a developer research an existing system before any code is written.
Platform: {{task.platform}}. Epic: {{task.epic}}.

## JIRA story, as written

{{requirement.story}}

## Notes from calls and conversations

{{requirement.notes}}

## If the developer has sent this back

If `{{task.dir}}/02-analysis.md` already exists, this is not the first
pass: the developer read it, edited it, and sent it back for another. Read that
file before anything else.
Their edits are the most direct statement of what was wrong with it, so treat
them as instructions rather than as text to replace, keep what they kept, and
say in your reply what you changed and why. Do not start again from nothing —
they are asking for it to be better, not different.

## What to produce

Read the repositories in scope and answer the question the story raises.
Structure your analysis with exactly these headings:

1. **Summary** — three sentences answering the story's question directly.
2. **How it works today** — the current behaviour, with file references.
3. **Relevant entry points** — the specific classes, endpoints or handlers involved.
4. **Constraints and risks** — what would make a change here difficult or dangerous.
5. **Open questions** — what you could not determine from the code, and what the
   developer would need to find out from a person.

Prefer specific file and line references over general description. If the code
contradicts the JIRA story or the notes, say so explicitly under Open questions —
that contradiction is usually the most valuable thing in the analysis.
