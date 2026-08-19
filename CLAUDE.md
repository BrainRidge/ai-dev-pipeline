# Working in this repository

## Where documents go

| Kind | Location |
|---|---|
| Design / spec | `docs/spec/` — one file per numbered section |
| Implementation plans | `docs/plans/<phase>/` — one file per task |
| Manual release checks | `docs/MANUAL-ACCEPTANCE.md` |

**This overrides the default spec location.** Brainstorming and planning workflows
otherwise write to `docs/superpowers/specs/` and `docs/superpowers/plans/`. Do not
create those directories; the documents were deliberately moved out of them, and
recreating them splits the design across two trees that drift apart.

## The section numbers are load-bearing

Twenty-five source files cite the design as `// See spec Section 5`. Section *N*
lives in the `docs/spec/` file whose name begins with `0N`. Decisions are cited as
`D1`–`D9` and all live in `docs/spec/04-decisions.md`.

Plans use the same scheme among themselves: a plan document that says "(Task 8)"
means the file beginning `08` in that phase's folder.

Consequences:

- **Add sections at the end.** Renumbering silently invalidates comments across the
  codebase — nothing fails, the references just quietly stop resolving.
- **Do not split `04-decisions.md`.** A decision id has to resolve to one file.
- If a section genuinely has to move, update the citing comments in the same commit.

## When the code and the spec disagree

The code is right and the spec is the document to correct. Plans under `docs/plans/`
are historical records of what was built; they are not corrected after the fact.

## Commands

`npm run verify` runs typecheck, lint and the unit tests. `npm run test:integration`
runs the extension-host tests. `npm run build` produces the bundles in `out/`, which
is tracked deliberately so a checkout stays installable without a build step.
