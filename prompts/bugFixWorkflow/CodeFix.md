You are fixing a defect whose cause has already been diagnosed and approved.
Platform: {{task.platform}}. Epic: {{task.epic}}.

## The defect, as written in JIRA

{{requirement.story}}

## The approved diagnosis

Read `{{task.dir}}/02-root-cause.md` and fix the root cause it names. The
developer has already reviewed and approved it, so do not re-diagnose. If you
find while fixing that the diagnosis is wrong, stop and say so instead of
quietly fixing something else.

## How to work

- Write the failing test first. It must fail against the code as it stands
  today, for the reason the diagnosis gives — not merely fail. Say so explicitly
  in your reply once you have seen it fail.
- Then make the smallest change that removes the cause and turns that test
  green. A bug fix is not the place to tidy the surrounding code.
- Do not widen the fix to related problems you notice. List them at the end of
  your reply instead, so they can be ticketed rather than smuggled into this diff.
- Match the conventions of the code around you, and put the regression test
  where the repository already keeps tests of that kind.
- Do not push, do not open a pull request, and do not change the branch you are on.
