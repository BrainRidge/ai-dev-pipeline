# Task 4: Wiring the button into the sidebar

> Part of the [Epic Browser Fetch implementation plan](README.md).

Gives the Epic field its action and makes `fetchEpic` do something. This is the first task that
touches `vscode` — `SetupView.ts` is not unit-testable the way Tasks 0–3 are — so it is kept as
thin as possible: everything it does is call into `fetchEpic` ([Task 3](03-browser-epic-fetcher.md))
and set `this.values.epicContext` or `this.errors.epic`, both of which `render()` already knows
how to draw.

**Files:**
- Modify: `src/session/SetupView.ts`

**Interfaces:**
- Consumes: `fetchEpic`, `JIRA_BASE_URL_NOT_SET` (Task 3); `chromiumLauncher`, `profileDir`,
  `findBrowser` (Task 1)

---

- [ ] **Step 1: Give the Epic field its action**

In `newDescriptor`:

```typescript
{ id: 'epic', type: 'text', label: 'Epic', required: true, action: { id: 'fetchEpic', label: 'Fetch from browser' } },
```

- [ ] **Step 2: A launcher built once per `SetupView`, not once per click**

Add a field and a lazy getter, so the dedicated profile's browser is found and launched at most
once, and only when actually used:

```typescript
private launcher: BrowserLauncher | undefined

private async browserLauncher(): Promise<BrowserLauncher> {
  if (!this.launcher) {
    const nodeProbe: ExecutableProbe = {
      async firstExisting(candidates) {
        for (const c of candidates) {
          try {
            await access(c)
            return c
          } catch {
            continue
          }
        }
        return undefined
      },
    }
    const executable = await findBrowser(process.platform, nodeProbe)
    this.launcher = chromiumLauncher(executable, profileDir(this.context.globalStorageUri.fsPath))
  }
  return this.launcher
}
```

(`access` from `node:fs/promises`, already imported elsewhere in this file's neighbours —
add the import if it is not already present.)

- [ ] **Step 3: Handle the action**

In `onAction`, alongside the existing `browse`/`open`/`start` branches:

```typescript
if (actionId === 'fetchEpic') {
  await this.fetchEpic()
  return
}
```

And the method itself:

```typescript
private async fetchEpic(): Promise<void> {
  const epic = String(this.values.epic ?? '').trim()
  delete this.errors.epic

  if (!epic) {
    this.errors.epic = 'Enter an epic key before fetching.'
    await this.render()
    return
  }

  const jiraBaseUrl = vscode.workspace.getConfiguration('aiDevWorkflow').get<string>('jiraBaseUrl')

  let launcher: BrowserLauncher
  try {
    launcher = await this.browserLauncher()
  } catch (err) {
    this.errors.epic = err instanceof Error ? err.message : String(err)
    await this.render()
    return
  }

  const result = await fetchEpic(epic, jiraBaseUrl, launcher)
  if (!result.ok) {
    this.errors.epic = result.message
    await this.render()
    return
  }

  // The story field the developer will see two screens from now still gets
  // the chance to be edited or ignored entirely — this only sets a starting
  // point. See Task 5.
  this.values.epicContext =
    [result.ticket.description, result.ticket.acceptanceCriteria].filter(Boolean).join('\n\n')
  await this.render()
}
```

Note for the implementer: `fetchEpic` (Task 3) is a slow, real network+browser call — `render()`
being called synchronously around it means the sidebar shows no "fetching…" state while it
runs. If that turns out to matter in manual acceptance ([Task 7](07-documentation.md)), the
smallest fix is a boolean `this.fetching = true` rendered as a disabled button, not a bigger
change to this method's shape.

- [ ] **Step 4: Run the full gate**

Run: `npm run verify`
Expected: PASS (this task adds no new unit tests of its own — `SetupView` is exercised at the
integration tier; see [Task 8](08-verification.md))

- [ ] **Step 5: Rebuild and commit**

```bash
npm run build
git add src/session/SetupView.ts out/
git commit -m "feat(sidebar): wire Fetch from browser to the Epic field

Builds the dedicated-profile launcher lazily, calls fetchEpic, and
turns every outcome into either this.values.epicContext or a field
error on epic — nothing silent. See spec Section 19."
```
