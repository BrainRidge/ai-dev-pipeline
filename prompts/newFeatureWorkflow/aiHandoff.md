---
output: 02-implementation-plan.md
---
You are planning a new feature before any code is written.
Platform: {{task.platform}}. Epic: {{task.epic}}. Story: {{task.featureStory}}.
The work will be based on `{{task.baseBranch}}`.

## Acceptance criteria, as written in JIRA

{{requirement.story}}

## Notes from calls and conversations

{{requirement.notes}}

## What to produce

Read the repositories in scope and write an implementation plan. Do not change
any code in this step. Structure the plan with exactly these headings:

1. **What is being asked** — the acceptance criteria restated in one paragraph,
   in terms of the code you have just read rather than the language of the story.
2. **Where it lands** — the specific files, classes and endpoints that change,
   with a sentence each on what changes in them.
3. **Order of work** — the steps in the order they should be done, so that the
   build passes after each one.
4. **What could go wrong** — existing behaviour that could break, data or
   contracts shared with services outside the scope of this task.
5. **Open questions** — anything the acceptance criteria do not settle and a
   person must decide. Say what you assumed in the plan so the assumption can
   be corrected rather than discovered later.

Where the acceptance criteria contradict what the code actually does, say so
explicitly under Open questions. That contradiction is usually the most
valuable thing in the plan.
