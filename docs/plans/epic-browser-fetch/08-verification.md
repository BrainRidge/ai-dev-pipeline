# Task 8: End-to-end verification

> Part of the [Epic Browser Fetch implementation plan](README.md).

Closes the loop the way `external-content/07-verification.md` did for that plan: confirm the
whole gate is green, confirm the package is still correct, and walk what can be walked by hand.

**Files:** none — this task adds no code, it runs what the previous eight produced.

---

- [ ] **Step 1: The full automated gate**

Run: `npm run verify`
Expected: PASS, in full.

- [ ] **Step 2: Integration tier**

Run: `npm run test:integration`
Expected: PASS. If [Task 4](04-setup-view-wiring.md) added a sidebar round-trip test for
`fetchEpic`, confirm it is included and passes here rather than only under the unit tier's
jsdom stand-in.

- [ ] **Step 3: Packaging**

Run: `npm run check:package`
Expected: PASS — `chrome-remote-interface` ships, nothing under `src/browser/` or `test/` does.

- [ ] **Step 4: Bundle freshness**

Run: `npm run build`
Expected: no diff against what is already committed in `out/` — if there is one, an earlier
task forgot to rebuild before committing.

- [ ] **Step 5: Manual acceptance**

Walk every criterion added in [Task 7](07-documentation.md), on a real machine with a real
Chrome or Edge and a real Jira instance. Nothing before this step in the whole plan has touched
a real browser.

- [ ] **Step 6: Confirm the spec matches what was actually built**

Re-read [Section 19](../../spec/19-epic-browser-fetch.md) against the code as it now stands.
Per [`CLAUDE.md`](../../../CLAUDE.md), the code is right and the spec is what gets corrected if
they disagree — record any such correction directly in Section 19 (and, if the disagreement is
about a decision rather than a mechanism, in D10), not in this plan, which stays a record of
what was intended rather than being edited after the fact.
