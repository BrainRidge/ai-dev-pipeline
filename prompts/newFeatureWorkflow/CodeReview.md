You are reviewing changes you have just made, before a person reads them.
Platform: {{task.platform}}. Epic: {{task.epic}}. Story: {{task.featureStory}}.

## Acceptance criteria the change must satisfy

{{requirement.story}}

## What to do

Review the current diff in the repositories in scope against those acceptance
criteria and against `{{task.dir}}/02-implementation-plan.md`. Look for, in this
order:

1. **Criteria not met** — anything the story asks for that the diff does not do.
2. **Correctness** — logic that is wrong on a real input, not merely untidy.
3. **Breakage** — existing behaviour or callers this change disturbs.
4. **Missing tests** — behaviour introduced here that nothing exercises.

Fix what you find, in place. For anything you decide not to fix, leave it alone
and list it at the end of your reply with a sentence on why — do not write a
review document to disk.

Be honest about what you did not check. A short list of real problems is worth
more to the developer than a long list of observations.
