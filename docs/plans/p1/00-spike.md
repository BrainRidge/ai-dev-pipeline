# Task 0: Spike — resolve the two verification questions

> Part of the [Phase 1 implementation plan](README.md). Completed and shipped.

**Not TDD.** Output is a decision recorded in the spec, not code. Time-box: 60 minutes.

**Files:**
- Modify: `docs/spec/12-verification-tasks.md`

- [ ] **Step 1: Install GitHub Copilot in VS Code**

No Copilot extension was found in `~/.vscode/extensions` on the development machine. Install it and sign in — Tasks 13 and 17 cannot be tested without it. Enable agent mode in Copilot settings.

- [ ] **Step 2: Determine whether `workbench.action.chat.open` accepts a prompt**

In the Extension Development Host (or the built-in command palette developer tools), evaluate:

```typescript
await vscode.commands.executeCommand('workbench.action.chat.open', { query: 'hello world' })
```

Record which of these happens:
- Chat opens with "hello world" prefilled → **mechanism A available**
- Chat opens empty → **mechanism A unavailable, use B**
- Command errors → **mechanism A unavailable, use B**

Also try `{ query: 'hello', mode: 'agent' }` and record whether agent mode is selected.

- [ ] **Step 3: Determine the webview toolkit status**

Check whether `@vscode/webview-ui-toolkit` is still published and supported on npm:

```bash
npm view @vscode/webview-ui-toolkit deprecated version
```

If deprecated or unmaintained, the plan's default stands: plain HTML with VS Code theme CSS variables. **No task in this plan depends on the toolkit** — this step exists only to confirm we are not passing up a supported option.

- [ ] **Step 4: Record findings in the spec**

Replace Section 12's table rows with the answers found. State the chosen handoff mechanism (A, B or C) explicitly, because Task 13 implements it as the primary path.

- [ ] **Step 5: Commit**

```bash
git add docs/spec/12-verification-tasks.md
git commit -m "docs: record V1/V2 spike findings"
```
