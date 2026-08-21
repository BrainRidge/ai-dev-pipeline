# Task 5: Relocating config, and packaging

> Part of the [External content implementation plan](README.md).

Nothing in `src/` has read the bundled `config/` since Task 3, so it can now be
moved without breaking anything except the ten test call sites that load it
directly. Those move with it.

The directory becomes `examples/content-template/` — the thing a team copies to
bootstrap. It ships inside the `.vsix` so it can be copied out of an installed
extension rather than cloned from this repository.

The three sample services currently point at `github.com/kumartj`, which is a
real account and not the team's. They are replaced with obviously non-functional
placeholders, so that nobody ships a task that clones somebody else's code.

**Files:**
- Move: `config/` → `examples/content-template/config/`
- Create: `examples/content-template/README.md`
- Create: `.vscodeignore`
- Modify: `examples/content-template/config/microservices.json`
- Modify: `test/config/catalog.test.ts` — the `CONFIG` constant
- Modify: `test/workflow/researchTaskWorkflow.test.ts` — 1 `WorkflowCatalog.load` call
- Modify: `test/workflow/bugFixWorkflow.test.ts` — 2 calls
- Modify: `test/workflow/newFeatureWorkflow.test.ts` — 2 calls
- Modify: `test/workflow/secondWorkflow.test.ts` — 3 calls

Ten call sites in total. Task 1 has already added an import line to four of
these files, so find them by name rather than by line number:

```bash
grep -rn "join(ROOT, 'config')\|'../../config'" test/
```

**Interfaces:**
- Consumes: nothing new
- Produces: `examples/content-template/` as the documented bootstrap layout

---

- [ ] **Step 1: Move the directory, preserving history**

```bash
mkdir -p examples/content-template
git mv config examples/content-template/config
```

- [ ] **Step 2: Replace the placeholder services**

Overwrite `examples/content-template/config/microservices.json`. The git
locations must be unmistakably fake: a real-looking URL invites somebody to run
the clone commands the `gitClone` step will generate from them.

```json
[
  {
    "microserviceName": "example-reference-data-service",
    "shortCode": "ref",
    "purpose": "REPLACE ME — one line on what this service is for.",
    "gitLocation": "https://git.example.invalid/your-org/example-reference-data-service.git",
    "category": "backend-service"
  },
  {
    "microserviceName": "example-party-service",
    "shortCode": "party",
    "purpose": "REPLACE ME — one line on what this service is for.",
    "gitLocation": "https://git.example.invalid/your-org/example-party-service.git",
    "category": "backend-service"
  }
]
```

`.invalid` is reserved by RFC 2606 and can never resolve, so a clone fails
immediately rather than reaching somebody's repository.

- [ ] **Step 3: Write the bootstrap README**

Create `examples/content-template/README.md`:

```markdown
# Content template

Copy this folder somewhere your team owns — a small git repository is the
intended shape — then point `aiDevWorkflow.contentRoot` at your copy:

**Settings → Extensions → AI Dev Workflow → Content Root**

Commit the setting to a repository's `.vscode/settings.json` and everyone
working in that repository resolves the same content.

## What goes in it

    <your copy>/
    ├── config/
    │   ├── platforms.json        required
    │   └── microservices.json    required
    └── prompts/
        └── <workflowId>/
            └── <stepId>.md       optional, per file

**`config/` is required and does not fall back.** Until both files are present
and valid, the sidebar shows what is wrong and nothing else. That is deliberate:
the bundled catalogue would name repositories belonging to another team, and the
`gitClone` step would put them on your disk.

**`prompts/` is optional and falls back per file.** Any template you do not
supply uses the one shipped with the extension, so overriding a single prompt is
a one-file repository — and every prompt a later release adds still reaches you.
Name each file after the step id in the workflow, exactly: `aiHandoff.md`, not
`aiHandoff.MD`. A name differing only in case is reported as an error rather
than silently ignored.

**`workflows/` is not read.** Which steps run, and in what order, is what the
extension standardises; it is bundled and changed by release.

See [spec Section 16](../../docs/spec/16-external-content.md) for the whole
contract.
```

- [ ] **Step 4: Declare what ships**

Create `.vscodeignore`. Everything is excluded and the four shipped directories
are added back, so a new directory does not ship by accident:

```
**

!out/**
!workflows/**
!prompts/**
!examples/**
!media/**
!package.json
!CLAUDE.md

out/**/*.map
out/src/**
out/test/**
out/webview/**
out/dev.js
```

The trailing exclusions matter: `out/` holds sourcemaps and the unbundled `tsc`
output that `npm run compile:test` leaves behind, none of which the extension
loads at runtime.

- [ ] **Step 5: Repoint the ten test call sites**

In `test/config/catalog.test.ts`, line 8:

```typescript
const CONFIG = join(__dirname, '../../examples/content-template/config')
```

In `test/workflow/researchTaskWorkflow.test.ts`, `bugFixWorkflow.test.ts`,
`newFeatureWorkflow.test.ts` and `secondWorkflow.test.ts`, add a constant beside
the existing `ROOT` and use it at every site that currently says
`join(ROOT, 'config')`:

```typescript
const CONFIG = join(ROOT, 'examples/content-template/config')
```

```bash
grep -rn "join(ROOT, 'config')\|'../../config'" test/
```

Expected after the edit: no output.

- [ ] **Step 6: Fix the two catalogue tests that assert bundled content**

`test/config/catalog.test.ts` asserts four specific platform ids. The template
keeps the same four, so that test is unchanged. Its microservice tests already
assert shape rather than contents — the comment in that file says so
deliberately — so they pass against the template unchanged.

Verify rather than assume:

Run: `npx vitest run test/config/catalog.test.ts test/workflow`
Expected: PASS

- [ ] **Step 7: Run the full gate**

Run: `npm run verify`
Expected: PASS, 426 tests

- [ ] **Step 8: Confirm the package contains what it should**

```bash
npx vsce ls --allow-missing-repository 2>/dev/null | sort
```

Expected: `out/extension.js`, `out/webview.js`, `out/setup.js`, `out/style.css`,
the three files under `workflows/`, the seven under `prompts/`, the three under
`examples/content-template/`, `media/icon.svg` and `package.json`.
Expected absent: anything under `config/`, `src/`, `test/`, `node_modules/`, and
any `.map` file.

- [ ] **Step 9: Rebuild and commit**

```bash
npm run build
git add -A examples .vscodeignore test/ out/
git commit -m "refactor(config): move the bundled catalogue to examples/content-template

Nothing reads config/ any more, so it becomes the folder a team copies to
bootstrap. Sample services are now unmistakably fake. Adds the
.vscodeignore that Section 10 always claimed existed. See spec Section 16."
```
