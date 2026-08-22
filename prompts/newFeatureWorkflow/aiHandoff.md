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

## If the developer has sent this back

If `{{task.dir}}/02-implementation-plan.md` already exists, this is not the first
pass: the developer read it, edited it, and sent it back for another. Read that
file before anything else.
Their edits are the most direct statement of what was wrong with it, so treat
them as instructions rather than as text to replace, keep what they kept, and
say in your reply what you changed and why. Do not start again from nothing —
they are asking for it to be better, not different.

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
