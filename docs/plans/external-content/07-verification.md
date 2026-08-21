# Task 7: End-to-end verification

> Part of the [External content implementation plan](README.md).

Two problems in the existing tree land here, because this change breaks them
either way:

1. **`npm run test:integration` cannot run.** `@vscode/test-cli` needs a
   `.vscode-test.mjs` and there is none, despite
   [Section 11](../../spec/11-build-test-and-enforcement.md) describing the tier.
   Whatever that tier was last run with is not in the repository.
2. **`test/integration/research-workflow.test.ts` asserts that
   `config/microservices.json` ships inside the extension.** Task 5 deleted that
   directory, so the assertion has to move with it.

**Files:**
- Create: `.vscode-test.mjs`
- Modify: `test/integration/research-workflow.test.ts` — the final `test(...)` in the suite
- Modify: `docs/spec/11-build-test-and-enforcement.md`

**Interfaces:**
- Consumes: everything from Tasks 0–6
- Produces: a runnable integration tier

---

- [ ] **Step 1: Make the integration tier runnable**

Create `.vscode-test.mjs`. The integration tests are Mocha-style (`suite` /
`test`) and are compiled to `out/` by `npm run compile:test`, which
`pretest:integration` already runs:

```javascript
import { defineConfig } from '@vscode/test-cli'

// The integration tier is the only one that needs a real extension host:
// activation, resume-after-reload, workspace authoring, snapshot tampering.
// Everything else lives in the vitest tiers and runs without VS Code.
export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  version: 'stable',
})
```

- [ ] **Step 2: Run it, and expect the config assertion to fail**

Run: `npm run test:integration`
Expected: VS Code downloads on first run, then four tests pass and one fails —
`the bundled workflow and its configuration ship inside the extension`, with
`ENOENT` on `config/microservices.json`.

That failure is the correct answer: `config/` no longer ships.

- [ ] **Step 3: Point that test at what ships now**

In `test/integration/research-workflow.test.ts`, replace the final test:

```typescript
  test('the bundled workflow and the content template ship inside the extension', async () => {
    const ext = vscode.extensions.getExtension('internal.ai-dev-workflow')
    assert.ok(ext, 'extension not found')

    const workflow = JSON.parse(
      await readFile(
        join(ext.extensionPath, 'workflows', 'researchTaskWorkflow_1_0.json'),
        'utf8',
      ),
    )
    assert.strictEqual(workflow.initialStep, 'requirement')

    // Prompts still ship: they are the per-file fallback for any template a
    // team has not supplied. See spec Section 16.
    const prompt = await readFile(
      join(ext.extensionPath, 'prompts', 'researchTaskWorkflow', 'aiHandoff.md'),
      'utf8',
    )
    assert.ok(prompt.includes('output:'), 'the bundled template declares its artifact')

    // Config does not ship. The template a team copies does.
    const services = JSON.parse(
      await readFile(
        join(ext.extensionPath, 'examples', 'content-template', 'config', 'microservices.json'),
        'utf8',
      ),
    )
    assert.ok(Array.isArray(services) && services.length > 0)

    await assert.rejects(
      readFile(join(ext.extensionPath, 'config', 'microservices.json'), 'utf8'),
      'config/ must not ship — nothing reads it and it would name another team’s repos',
    )
  })
```

- [ ] **Step 4: Add a test for the setting being contributed**

Append to the same suite:

```typescript
  test('the content root setting is contributed and defaults to unset', () => {
    const ext = vscode.extensions.getExtension('internal.ai-dev-workflow')
    assert.ok(ext)
    const props =
      ext.packageJSON.contributes.configuration.properties as Record<string, { default: unknown }>
    assert.ok('aiDevWorkflow.contentRoot' in props)
    assert.strictEqual(props['aiDevWorkflow.contentRoot'].default, '')
  })
```

An empty default is what puts a fresh install into the unconfigured state rather
than silently reading somebody else's catalogue.

- [ ] **Step 5: Run the integration tier**

Run: `npm run test:integration`
Expected: PASS, 6 tests

- [ ] **Step 6: Correct Section 11 to say the tier is runnable**

In `docs/spec/11-build-test-and-enforcement.md`, append to the **Tests** section:

```markdown
The integration tier is configured by `.vscode-test.mjs`, which points
`@vscode/test-cli` at the compiled tests under `out/test/integration/`.
`pretest:integration` runs `tsc` to produce them.
```

- [ ] **Step 7: Run the whole gate, both tiers**

```bash
npm run verify && npm run test:integration && npm run build
```

Expected: 426 unit tests pass, 6 integration tests pass, four bundles written.

- [ ] **Step 8: Walk the manual script**

Work through `docs/MANUAL-ACCEPTANCE.md` as corrected in Task 6, with real
Copilot and a real repository you can clone. Criteria **0a, 0b, 0c, 13 and 14**
are new and are the point of this change; the rest are regression checks.

Record any failure with what happened instead. A failure of criterion 11 — a
tool developer adding a workflow with no TypeScript — is a design finding and
goes back to the spec rather than being patched around.

- [ ] **Step 9: Package and install the build under test**

```bash
npx vsce package --allow-missing-repository --skip-license
code --install-extension ai-dev-workflow-0.1.0.vsix
```

Then confirm on the installed extension, not on the checkout:

- **Settings → Extensions → AI Dev Workflow** lists **Content Root** first
- With it unset, the sidebar shows the unconfigured message and nothing else
- `examples/content-template/` is present inside the installed extension folder
- `config/` is not

- [ ] **Step 10: Commit**

```bash
git add .vscode-test.mjs test/integration/ docs/spec/11-build-test-and-enforcement.md out/
git commit -m "test: make the integration tier runnable and reflect the move

Adds the missing .vscode-test.mjs — the tier could not run at all
without it — and repoints the packaging assertion at
examples/content-template, asserting that config/ no longer ships.
See spec Section 16."
```

---

## Definition of done

- [ ] `npm run verify` passes
- [ ] `npm run test:integration` passes
- [ ] `out/` rebuilt and committed
- [ ] Every criterion in `docs/MANUAL-ACCEPTANCE.md` walked, failures recorded
- [ ] No file under `src/` or `webview/` references `context.extensionPath` for
      config any more:
      ```bash
      grep -rn "extensionPath, 'config'" src webview
      ```
      Expected: no output
- [ ] The bundled prompts still ship, because they are the fallback:
      ```bash
      npx vsce ls --allow-missing-repository | grep '^prompts/'
      ```
      Expected: seven files
