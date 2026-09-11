---
include:
  - _shared/house-rules.md
---
You are implementing a feature that has already been planned and approved.
Platform: {{task.platform}}. Epic: {{task.epic}}. Story: {{task.featureStory}}.

## Acceptance criteria, as written in JIRA

{{requirement.story}}

## Notes from calls and conversations

{{requirement.notes}}

## The approved plan

Read `{{task.dir}}/02-implementation-plan.md` and implement it. The developer has
already reviewed and approved it, so follow it rather than re-deciding the
approach.

## How to work

- Follow the order of work in the plan, so the build passes after each step.
