# Documentation

| Where | What |
|---|---|
| [`spec/`](spec/README.md) | The design. One file per numbered section — this is what a change to the tool's design edits. |
| [`plans/`](plans/README.md) | Implementation plans, one folder per phase. Historical records once shipped. |
| [`MANUAL-ACCEPTANCE.md`](MANUAL-ACCEPTANCE.md) | The checks a person runs by hand before a release. |

## The number is the address

Both folders are numbered, and in both the number is how a document is referred to
from elsewhere.

## Why the spec is numbered

Twenty-five source files cite the design by section number — `// See spec Section 5`.
Section *N* therefore lives in `spec/` in the file whose name begins with `0N`, and
that mapping is load-bearing: renumbering a section silently invalidates comments
across the codebase. Add new sections at the end rather than inserting.

Decisions are cited the same way, as `D1`–`D9`, and all live in
[`spec/04-decisions.md`](spec/04-decisions.md).

## Why the plan is numbered

Plan documents cross-reference each other in prose — "Consumes `StepDescriptor` (Task 8)".
Task *N* is the file beginning `0N`, so the reference resolves the same way a spec section
reference does. The files are numbered rather than named `task-*` because "task" already
means two other things here: a task *type* in a workflow (Research, New Feature, Bug Fix)
and a developer's task folder under the tasks root.
