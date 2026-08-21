# Task 3: The setting, and TaskSession

> Part of the [External content implementation plan](README.md).

The setting appears, and the extension starts reading it. After this task the
bundled `config/` directory is no longer read by any code in `src/` — but it is
still on disk, and the tests that load it still pass. Task 5 is what moves it.
Splitting it this way keeps the tree green between the two.

Also here: the `content-resolved` audit entry, and the warning for a team that
puts a `workflows/` folder in their content root expecting it to be honoured.

**Files:**
- Modify: `package.json` — `contributes.configuration.properties`
- Modify: `src/engine/WorkflowCatalog.ts` — the head of `WorkflowCatalog.load`
- Modify: `src/session/TaskSession.ts` — beside `tasksRoot`, inside `TaskSession.open`, and the module-level `loadCatalog`
- Modify: `src/extension.ts` — beside the `notifyIfOutOfDate` call
- Modify: `test/config/catalog.test.ts`
- Create: `test/engine/configErrors.test.ts`

**Interfaces:**
- Consumes: `resolveContentRoot`, `configDirOf`, `externalWorkflowsPresent`, `nodeProbe`, `ContentRootResult` (Task 0); `buildTaskTypes` (Task 1)
- Produces:
  - Setting `aiDevWorkflow.contentRoot`
  - `contentRoot(): ContentRootResult` in `src/session/TaskSession.ts`
  - Audit entry `kind: 'content-resolved'` with `data: { contentRoot, configDir, files: { name, path, sha256 }[] }`

---

- [ ] **Step 1: Contribute the setting**

In `package.json`, inside `contributes.configuration.properties`, add
`contentRoot` as the first entry — it is the one a developer must set, so it
belongs above the optional ones:

```json
        "aiDevWorkflow.contentRoot": {
          "type": "string",
          "default": "",
          "markdownDescription": "Absolute path to the folder holding your team's `config/` and `prompts/`. Required — the extension ships no service catalogue of its own. See the `examples/content-template` folder for the expected layout."
        },
```

- [ ] **Step 2: Write the failing tests for the config-file error messages**

Create `test/engine/configErrors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkflowCatalog } from '../../src/engine/WorkflowCatalog'

const WORKFLOWS = join(__dirname, '../../workflows')

async function configDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cfg-'))
  await mkdir(dir, { recursive: true })
  for (const [name, body] of Object.entries(files)) await writeFile(join(dir, name), body)
  return dir
}

const PLATFORMS = JSON.stringify({ platforms: [{ id: 'p', label: 'P' }] })

/**
 * These errors used to be raised on a tool developer's machine at build time.
 * They are now raised on a team member's machine at load time, so reaching the
 * developer intact matters more rather than less. See spec Section 16.
 */
describe('loading a content root that is wrong', () => {
  it('names the missing file and the path it looked at', async () => {
    const dir = await configDir({ 'platforms.json': PLATFORMS })
    await expect(WorkflowCatalog.load(WORKFLOWS, dir)).rejects.toThrow(
      `microservices.json not found at ${join(dir, 'microservices.json')}`,
    )
  })

  it('names platforms.json when that is the one missing', async () => {
    const dir = await configDir({ 'microservices.json': '[]' })
    await expect(WorkflowCatalog.load(WORKFLOWS, dir)).rejects.toThrow(
      `platforms.json not found at ${join(dir, 'platforms.json')}`,
    )
  })

  it('attributes a schema failure to the file it came from', async () => {
    const dir = await configDir({
      'platforms.json': PLATFORMS,
      'microservices.json': JSON.stringify([{ shortCode: 'x' }]),
    })
    await expect(WorkflowCatalog.load(WORKFLOWS, dir)).rejects.toThrow(/microservices\.json/)
  })

  it('reports malformed JSON against the file rather than as a bare syntax error', async () => {
    const dir = await configDir({ 'platforms.json': PLATFORMS, 'microservices.json': '[' })
    await expect(WorkflowCatalog.load(WORKFLOWS, dir)).rejects.toThrow(/microservices\.json/)
  })

  // validateMicroservices already produces the most useful error the catalogue
  // loader has. It must not be flattened into a generic message.
  it('passes a duplicate shortCode through with its own wording intact', async () => {
    const dir = await configDir({
      'platforms.json': PLATFORMS,
      'microservices.json': JSON.stringify([
        { microserviceName: 'A', shortCode: 'dup', gitLocation: 'https://h/a' },
        { microserviceName: 'B', shortCode: 'dup', gitLocation: 'https://h/b' },
      ]),
    })
    await expect(WorkflowCatalog.load(WORKFLOWS, dir)).rejects.toThrow(
      'microservices: "B" and "A" share the shortCode "dup"',
    )
  })

  it('passes a cloning collision through the same way', async () => {
    const dir = await configDir({
      'platforms.json': PLATFORMS,
      'microservices.json': JSON.stringify([
        { microserviceName: 'A', shortCode: 'a', gitLocation: 'https://h/same' },
        { microserviceName: 'B', shortCode: 'b', gitLocation: 'https://other/same.git' },
      ]),
    })
    await expect(WorkflowCatalog.load(WORKFLOWS, dir)).rejects.toThrow(/overwrite each other/)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run test/engine/configErrors.test.ts`
Expected: FAIL — the first two throw `ENOENT: no such file or directory`

- [ ] **Step 4: Give WorkflowCatalog attributable config errors**

In `src/engine/WorkflowCatalog.ts`, add a helper below the imports:

```typescript
/**
 * A config file now comes from a folder a team maintains rather than from the
 * extension bundle, so "which file, and where did we look" is the first thing
 * the reader needs. Errors from the schema and from validateMicroservices keep
 * their own wording — they are the most useful thing this loader says.
 * See spec Section 16.
 */
async function readConfig(configDir: string, name: string): Promise<unknown> {
  const path = join(configDir, name)
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`${name} not found at ${path}`)
    }
    throw err
  }

  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new Error(`${name} at ${path} is not valid JSON: ${(err as Error).message}`)
  }
}
```

Then replace the first two statements of `WorkflowCatalog.load`:

```typescript
    const platformsRaw = await readConfig(configDir, 'platforms.json')
    const platforms = attribute('platforms.json', configDir, () =>
      platformsFileSchema.parse(platformsRaw),
    ).platforms

    const servicesRaw = await readConfig(configDir, 'microservices.json')
    const services = attribute('microservices.json', configDir, () =>
      microservicesFileSchema.parse(servicesRaw),
    )
    validateMicroservices(services)
```

and add `attribute` beside `readConfig`:

```typescript
/** Names the file a schema failure came from; zod's own message does not. */
function attribute<T>(name: string, configDir: string, parse: () => T): T {
  try {
    return parse()
  } catch (err) {
    throw new Error(
      `${name} at ${join(configDir, name)} is not valid: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/engine/configErrors.test.ts test/config/catalog.test.ts`
Expected: PASS

- [ ] **Step 6: Read the setting in TaskSession**

In `src/session/TaskSession.ts`, add the imports:

```typescript
import { createHash } from 'node:crypto'
import {
  configDirOf,
  resolveContentRoot,
  type ContentRootResult,
} from '../content/ContentRoot'
```

Add beside `tasksRoot()`:

```typescript
/**
 * The team's content folder. Config comes only from here — there is no fallback,
 * because the bundled catalogue would name repositories belonging to somebody
 * else and gitClone would put them on this developer's disk. See spec Section 16.
 */
export function contentRoot(): ContentRootResult {
  return resolveContentRoot(config<string>('contentRoot'))
}
```

Replace `loadCatalog` at the foot of the file:

```typescript
function loadCatalog(context: vscode.ExtensionContext): Promise<WorkflowCatalog> {
  const resolved = contentRoot()
  if (!resolved.ok) throw new Error(resolved.message)
  return WorkflowCatalog.load(workflowsDir(context), configDirOf(resolved.root))
}
```

And in `TaskSession.open`, pass the root through to the task types, replacing the
placeholder Task 1 left:

```typescript
    const resolvedRoot = contentRoot()
    const registry = buildTaskTypes({
      contentRoot: resolvedRoot.ok ? resolvedRoot.root : undefined,
      bundledPromptsDir: join(context.extensionPath, 'prompts'),
      taskDir: ws.dir,
      codeRoot: resolveCodeRoot(config<string>('codeRoot')),
    })
```

`loadCatalog` runs first in `open`, so `resolvedRoot` is always `ok` by the time
this executes; the conditional exists because the type says it might not be.

- [ ] **Step 7: Record what was resolved, once per open**

Still in `TaskSession.open`, after `registry.validateWorkflow(...)` and before the
panel is created:

```typescript
    // Written on every open rather than only at creation: a resume may resolve
    // a different content root than the session that started the task, and the
    // log should say so. See spec Section 16.
    if (resolvedRoot.ok) {
      const configDir = configDirOf(resolvedRoot.root)
      await new AuditLog(ws.dir).append({
        kind: 'content-resolved',
        data: {
          contentRoot: resolvedRoot.root,
          configDir,
          files: await Promise.all(
            ['platforms.json', 'microservices.json'].map(async (name) => ({
              name,
              path: join(configDir, name),
              sha256: createHash('sha256')
                .update(await readFile(join(configDir, name), 'utf8'))
                .digest('hex'),
            })),
          ),
        },
      })
    }
```

`readFile` and `AuditLog` are already imported in this file.

- [ ] **Step 8: Warn about a workflows folder that will not be honoured**

In `src/extension.ts`, add the import and a call beside `notifyIfOutOfDate`:

```typescript
import { externalWorkflowsPresent, nodeProbe } from './content/ContentRoot'
import { contentRoot } from './session/TaskSession'
```

```typescript
  void notifyIfOutOfDate(context)
  void warnAboutExternalWorkflows()
```

```typescript
/**
 * Workflows stay bundled — they are what the tool standardises. A team that has
 * put a workflows folder in their content root has misread the contract, and
 * silence would let them believe it took effect. See spec Section 16.
 */
async function warnAboutExternalWorkflows(): Promise<void> {
  const resolved = contentRoot()
  if (!resolved.ok) return
  if (!(await externalWorkflowsPresent(resolved.root, nodeProbe))) return
  void vscode.window.showWarningMessage(
    'Your content folder contains a workflows/ directory. Workflow definitions ' +
      'are bundled with the extension and cannot be overridden, so it is ignored.',
  )
}
```

- [ ] **Step 9: Run the full gate**

Run: `npm run verify`
Expected: PASS, 419 tests. `test/config/catalog.test.ts` still loads the bundled
`config/` directly and still passes — Task 5 is what moves it.

- [ ] **Step 10: Rebuild and commit**

```bash
npm run build
git add package.json src/engine/WorkflowCatalog.ts src/session/TaskSession.ts \
        src/extension.ts test/ out/
git commit -m "feat(content): read config and prompts from aiDevWorkflow.contentRoot

Adds the setting and makes TaskSession resolve config and prompt
templates through it. Config errors now name the file and the path.
Logs content-resolved on every open, and warns about a workflows folder
that will not be honoured. See spec Section 16."
```
