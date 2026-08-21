# AI Dev Workflow — Phase 1 Design

**Date:** 2026-08-14
**Status:** Sections 1-17 implemented, revised 2026-08-21 to match the code as built.
**Scope:** Phase 1 (see [Phasing](03-phasing.md)), plus Sections 16 and 17, which
post-date it

---

## Sections

1. [Context](01-context.md)
2. [Goals and non-goals](02-goals-and-non-goals.md)
3. [Phasing](03-phasing.md)
4. [Decisions](04-decisions.md)
5. [Architecture](05-architecture.md)
6. [Workflow schema](06-workflow-schema.md)
7. [Run state and persistence](07-run-state-and-persistence.md)
8. [The AI handoff step](08-ai-handoff-step.md)
9. [Renderer contract](09-renderer-contract.md)
10. [Repository layout](10-repository-layout.md)
11. [Build, test and enforcement](11-build-test-and-enforcement.md)
12. [Verification tasks](12-verification-tasks.md)
13. [Release and distribution](13-release-and-distribution.md)
14. [Acceptance criteria for Phase 1](14-acceptance-criteria.md)
15. [Repository status](15-repository-status.md)
16. [External content](16-external-content.md)
17. [The System Check step](17-system-check.md)

---

Split from a single 751-line document. The numbering is load-bearing: source
comments reference the design as `See spec Section 5`, and section *N* lives
in the file whose name starts with `0N`. Decisions D1–D9 stay together in
[4. Decisions](04-decisions.md) so that `D6` resolves to one place.
