# Task 7: Documentation

> Part of the [Epic Browser Fetch implementation plan](README.md).

The spec (`docs/spec/19-epic-browser-fetch.md`), the decision (D10 in
`docs/spec/04-decisions.md`), and both README indexes (`docs/spec/README.md`,
`docs/plans/README.md`) were written ahead of this plan, per the project convention that a plan
is written from the spec. What remains is the one document that cannot be written until the
feature exists to walk: manual acceptance.

**Files:**
- Modify: `docs/MANUAL-ACCEPTANCE.md`

---

- [ ] **Step 1: Add criteria for the cold-start path**

This needs a machine with neither Chrome nor Edge signed into Jira via the extension's
dedicated profile yet — i.e. a fresh install, or a deliberately cleared
`browser-fetch-profile` folder under the extension's global storage:

- [ ] **N-a. Neither browser installed.** (Or temporarily rename both executables.) Press
      **Fetch from browser**. *Expected:* a field error under Epic naming both Chrome and Edge.
- [ ] **N-b. Setting unset.** Leave `aiDevWorkflow.jiraBaseUrl` empty. Press **Fetch from
      browser**. *Expected:* a field error quoting the setting name and where to set it — no
      browser window opens.
- [ ] **N-c. Cold start — first sign-in.** Set the base URL to a real Jira instance, clear the
      dedicated profile, type a real epic key, press **Fetch from browser**. *Expected:* a
      Chrome or Edge window opens showing the organisation's SSO prompt. Sign in, press
      **Fetch from browser** again. *Expected:* the field error clears and the fetch succeeds.
- [ ] **N-d. Warm fetch.** With the profile already signed in, type a different real epic key
      and press **Fetch from browser** again. *Expected:* succeeds with no visible browser
      window at all.
- [ ] **N-e. A key that does not exist.** *Expected:* a field error quoting the key, not a
      generic failure.
- [ ] **N-f. The story field is prefilled, and stays editable.** Start a task using an epic
      fetched in N-d, proceed to **Collect the requirement**. *Expected:* the story field
      already contains the fetched text; editing or clearing it and pressing Continue behaves
      exactly as manual entry always has.
- [ ] **N-g. Never fetching at all still works.** Start a task without ever pressing **Fetch
      from browser**. *Expected:* the story field is empty, exactly as before this feature
      existed.

- [ ] **Step 2: Cross-reference from the settings criterion**

Criterion 0a lists the five settings in order; add the sixth (`aiDevWorkflow.jiraBaseUrl`) to
that list so the two documents do not silently disagree about how many there are.

- [ ] **Step 3: Commit**

```bash
git add docs/MANUAL-ACCEPTANCE.md
git commit -m "docs: manual acceptance criteria for Fetch from browser"
```
