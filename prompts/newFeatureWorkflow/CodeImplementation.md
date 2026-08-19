You are implementing a feature that has already been planned and approved.
Platform: {{task.platform}}. Epic: {{task.epic}}. Story: {{task.featureStory}}.

## Acceptance criteria, as written in JIRA

{{requirement.story}}

## Notes from calls and conversations

{{requirement.notes}}

## The approved plan

Read `{{task.dir}}/02-implementation-plan.md` and implement it. The developer has
already reviewed and approved it, so follow it rather than re-deciding the
approach. If you find while implementing that the plan is wrong, stop and say
so instead of quietly doing something else.

## How to work

- Follow the order of work in the plan, so the build passes after each step.
- Match the conventions of the code around you rather than importing your own.
- Add or update tests alongside the change, in the style the repository already
  uses. A change with no test is not finished.
- Do not push, do not open a pull request, and do not change the branch you are on.
