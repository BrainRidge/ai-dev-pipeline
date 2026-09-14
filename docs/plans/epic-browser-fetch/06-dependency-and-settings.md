# Task 6: The dependency, and the setting

> Part of the [Epic Browser Fetch implementation plan](README.md).

Placed after the code that needs them, per the [ordering rationale](README.md#ordering-and-why)
— `npm run verify` and `npm run check:package` should never pass over an unused dependency or
an unread setting, even briefly.

**Files:**
- Modify: `package.json` — `dependencies`, `contributes.configuration.properties`
- Modify: `.vscodeignore` (if `chrome-remote-interface`'s own package needs excluding beyond
  what the existing devDependency-vs-dependency split already handles — check
  `package-check.mjs`'s expectations first)

---

- [ ] **Step 1: Add the dependency**

```bash
npm install chrome-remote-interface
```

Confirm afterwards that `package.json`'s `dependencies` now lists exactly:

```json
"dependencies": {
  "chrome-remote-interface": "^X.Y.Z",
  "yaml": "^2.5.0",
  "zod": "^3.23.0"
}
```

- [ ] **Step 2: The setting**

Add to `contributes.configuration.properties`, after `aiDevWorkflow.toolsConfig` and before
`aiDevWorkflow.tasksRoot` (grouping it with the other content-shaped settings rather than the
machine-shaped ones at the bottom — renumber the `order` values of everything from
`aiDevWorkflow.tasksRoot` onward by one):

```json
"aiDevWorkflow.jiraBaseUrl": {
  "type": "string",
  "default": "",
  "order": 6,
  "markdownDescription": "Base URL of your Jira instance, e.g. `https://yourteam.atlassian.net`. Required for the sidebar's **Fetch from browser** action beside the Epic field; leave unset and that button reports what to set instead of fetching."
}
```

- [ ] **Step 3: `npm run check:package`**

Run: `npm run check:package`
Expected: PASS — confirms the new dependency is expected to ship and nothing about the change
adds a file the packaging check does not already allow for.

- [ ] **Step 4: Run the full gate**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 5: Rebuild and commit**

```bash
npm run build
git add package.json package-lock.json out/
git commit -m "chore: add chrome-remote-interface; add the Jira base URL setting

First runtime dependency beyond yaml/zod, spent as recorded in spec
Section 19's Consequences."
```
