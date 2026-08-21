# Task 0: The content root resolver

> Part of the [External content implementation plan](README.md).

Everything else depends on this module and nothing imports it yet, so it can be
built and tested in isolation. It is pure: no `vscode`, no filesystem calls of
its own — directory listings arrive through an injected `DirectoryProbe`, which
is what makes the whole resolution matrix testable in memory.

**Files:**
- Create: `src/content/ContentRoot.ts`
- Create: `test/content/ContentRoot.test.ts`

**Interfaces:**
- Consumes: `isAbsolutePath` from `src/session/SetupSelection.ts` (already exported, already `vscode`-free)
- Produces: `TemplateSource`, `ResolvedTemplate`, `ContentRootResult`, `DirectoryProbe`, `TemplateResolver`, `NOT_CONFIGURED_MESSAGE`, `resolveContentRoot`, `configDirOf`, `promptsDirOf`, `templateResolver`, `externalWorkflowsPresent`, `nodeProbe`, `templateNote`

---

- [ ] **Step 1: Write the failing tests for the setting itself**

Create `test/content/ContentRoot.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  NOT_CONFIGURED_MESSAGE,
  resolveContentRoot,
  configDirOf,
  promptsDirOf,
} from '../../src/content/ContentRoot'

describe('resolveContentRoot', () => {
  it('reports the setting as unset when it is empty', () => {
    expect(resolveContentRoot('')).toEqual({ ok: false, message: NOT_CONFIGURED_MESSAGE })
  })

  it('treats undefined the same as empty, since VS Code gives both', () => {
    expect(resolveContentRoot(undefined)).toEqual({ ok: false, message: NOT_CONFIGURED_MESSAGE })
  })

  it('names the setting and where to find it, because the message is the whole fix', () => {
    expect(NOT_CONFIGURED_MESSAGE).toContain('aiDevWorkflow.contentRoot')
    expect(NOT_CONFIGURED_MESSAGE).toContain('Settings')
  })

  // A relative path resolves against whatever working directory the extension
  // host started in, which is not predictable. See spec Section 16.
  it('rejects a relative path, quoting what was given', () => {
    const result = resolveContentRoot('./team-content')
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toBe(
      'aiDevWorkflow.contentRoot must be an absolute path. Got "./team-content".',
    )
  })

  it('accepts an absolute POSIX path', () => {
    expect(resolveContentRoot('/Users/you/team-content')).toEqual({
      ok: true,
      root: '/Users/you/team-content',
    })
  })

  it('accepts an absolute Windows path', () => {
    expect(resolveContentRoot('C:\\team-content')).toEqual({ ok: true, root: 'C:\\team-content' })
  })

  it('trims surrounding whitespace, which a pasted path often carries', () => {
    expect(resolveContentRoot('  /Users/you/team-content  ')).toEqual({
      ok: true,
      root: '/Users/you/team-content',
    })
  })
})

describe('the layout inside the content root', () => {
  it('puts config where the extension repo puts it', () => {
    expect(configDirOf('/root')).toBe('/root/config')
  })

  it('puts prompts where the extension repo puts them', () => {
    expect(promptsDirOf('/root')).toBe('/root/prompts')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/content/ContentRoot.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/content/ContentRoot"`

- [ ] **Step 3: Write the setting half of the module**

Create `src/content/ContentRoot.ts`:

```typescript
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { isAbsolutePath } from '../session/SetupSelection'

export type TemplateSource = 'external' | 'bundled'

export interface ResolvedTemplate {
  path: string
  source: TemplateSource
}

export type ContentRootResult = { ok: true; root: string } | { ok: false; message: string }

/**
 * The message is the entire fix available to the person reading it, so it names
 * the setting and where the setting lives. See spec Section 16.
 */
export const NOT_CONFIGURED_MESSAGE =
  'No content folder configured. Set aiDevWorkflow.contentRoot in ' +
  'Settings \u2192 Extensions \u2192 AI Dev Workflow.'

/**
 * The configured content root, or the reason it cannot be used.
 *
 * Absolute paths only: a relative one would resolve against whatever working
 * directory the extension host happened to start in. This is the same rule
 * `SetupSelection` already applies to the work directory, and it reuses the
 * same predicate so the two cannot drift.
 */
export function resolveContentRoot(configured: string | undefined): ContentRootResult {
  const value = (configured ?? '').trim()
  if (value === '') return { ok: false, message: NOT_CONFIGURED_MESSAGE }
  if (!isAbsolutePath(value)) {
    return {
      ok: false,
      message: `aiDevWorkflow.contentRoot must be an absolute path. Got "${value}".`,
    }
  }
  return { ok: true, root: value }
}

/** The layout mirrors the extension repository, so a team bootstraps by copying. */
export function configDirOf(root: string): string {
  return join(root, 'config')
}

export function promptsDirOf(root: string): string {
  return join(root, 'prompts')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/content/ContentRoot.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Write the failing tests for template resolution**

Append to `test/content/ContentRoot.test.ts`, extending the import already at
the top of the file rather than adding a second one from the same module:

```typescript
import {
  NOT_CONFIGURED_MESSAGE,
  resolveContentRoot,
  configDirOf,
  promptsDirOf,
  externalWorkflowsPresent,
  templateNote,
  templateResolver,
  type DirectoryProbe,
} from '../../src/content/ContentRoot'

/** A disk that exists only in this test: directory path -> filenames. */
function probeOf(dirs: Record<string, string[]>): DirectoryProbe {
  return { async list(dir) { return dirs[dir] } }
}

const BUNDLED = '/ext/prompts'
const ROOT = '/team'

describe('resolving a prompt template', () => {
  it('uses the bundled template when no content root is configured', async () => {
    const resolve = templateResolver({ bundledPromptsDir: BUNDLED }, probeOf({}))
    expect(await resolve('researchTaskWorkflow', 'aiHandoff')).toEqual({
      path: '/ext/prompts/researchTaskWorkflow/aiHandoff.md',
      source: 'bundled',
    })
  })

  it('uses the bundled template when the team has no folder for that workflow', async () => {
    const resolve = templateResolver({ contentRoot: ROOT, bundledPromptsDir: BUNDLED }, probeOf({}))
    expect(await resolve('researchTaskWorkflow', 'aiHandoff')).toEqual({
      path: '/ext/prompts/researchTaskWorkflow/aiHandoff.md',
      source: 'bundled',
    })
  })

  // Per file, not per directory: overriding one prompt must not mean adopting
  // every other one and letting them go stale. See spec Section 16.
  it('falls back per file when the folder exists but that template does not', async () => {
    const resolve = templateResolver(
      { contentRoot: ROOT, bundledPromptsDir: BUNDLED },
      probeOf({ '/team/prompts/newFeatureWorkflow': ['CodeReview.md'] }),
    )
    expect(await resolve('newFeatureWorkflow', 'aiHandoff')).toEqual({
      path: '/ext/prompts/newFeatureWorkflow/aiHandoff.md',
      source: 'bundled',
    })
  })

  it("uses the team's template when they have supplied one", async () => {
    const resolve = templateResolver(
      { contentRoot: ROOT, bundledPromptsDir: BUNDLED },
      probeOf({ '/team/prompts/researchTaskWorkflow': ['aiHandoff.md'] }),
    )
    expect(await resolve('researchTaskWorkflow', 'aiHandoff')).toEqual({
      path: '/team/prompts/researchTaskWorkflow/aiHandoff.md',
      source: 'external',
    })
  })

  /**
   * The one mistake silent fallback must not hide. On a case-insensitive
   * filesystem this resolves and the team's prompt runs; on a case-sensitive
   * one it does not, and they would get the bundled prompt while believing
   * otherwise. See spec Section 16.
   */
  it('refuses a template that differs only by case, naming both names', async () => {
    const resolve = templateResolver(
      { contentRoot: ROOT, bundledPromptsDir: BUNDLED },
      probeOf({ '/team/prompts/researchTaskWorkflow': ['aiHandoff.MD'] }),
    )
    await expect(resolve('researchTaskWorkflow', 'aiHandoff')).rejects.toThrow(
      'found "aiHandoff.MD" in /team/prompts/researchTaskWorkflow, expected "aiHandoff.md"',
    )
  })

  it('prefers an exact match over a case variant sitting beside it', async () => {
    const resolve = templateResolver(
      { contentRoot: ROOT, bundledPromptsDir: BUNDLED },
      probeOf({ '/team/prompts/researchTaskWorkflow': ['aiHandoff.MD', 'aiHandoff.md'] }),
    )
    expect((await resolve('researchTaskWorkflow', 'aiHandoff')).source).toBe('external')
  })
})

describe('externalWorkflowsPresent', () => {
  // Workflows stay bundled. A team may reasonably expect otherwise, so their
  // folder is reported rather than ignored in silence. See spec Section 16.
  it('is true when the team has put a workflows folder in their content root', async () => {
    expect(
      await externalWorkflowsPresent(ROOT, probeOf({ '/team/workflows': ['mine_1_0.json'] })),
    ).toBe(true)
  })

  it('is false when they have not', async () => {
    expect(await externalWorkflowsPresent(ROOT, probeOf({}))).toBe(false)
  })

  it('is true even for an empty folder, because the intent is the signal', async () => {
    expect(await externalWorkflowsPresent(ROOT, probeOf({ '/team/workflows': [] }))).toBe(true)
  })
})

describe('templateNote', () => {
  it('marks a team template as external', () => {
    expect(templateNote({ path: '/team/prompts/w/s.md', source: 'external' })).toBe(
      'Template: /team/prompts/w/s.md (external)',
    )
  })

  it('says plainly when the bundled default was used', () => {
    expect(templateNote({ path: '/ext/prompts/w/s.md', source: 'bundled' })).toBe(
      'Template: /ext/prompts/w/s.md (bundled default)',
    )
  })
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run test/content/ContentRoot.test.ts`
Expected: FAIL — `templateResolver is not exported`

- [ ] **Step 7: Write the resolution half of the module**

Append to `src/content/ContentRoot.ts`:

```typescript
/**
 * A directory listing, injected so resolution can be tested without a disk.
 * `undefined` means the directory is not there — which is an ordinary outcome
 * here, not an error.
 */
export interface DirectoryProbe {
  list(dir: string): Promise<string[] | undefined>
}

export const nodeProbe: DirectoryProbe = {
  async list(dir) {
    try {
      return await readdir(dir)
    } catch {
      return undefined
    }
  },
}

export type TemplateResolver = (
  workflowId: string,
  stepId: string,
) => Promise<ResolvedTemplate>

/**
 * Resolves `<contentRoot>/prompts/<workflowId>/<stepId>.md`, falling back to the
 * bundled template of the same name when the team has not supplied one.
 *
 * Fallback is per file on purpose: a team overriding one prompt keeps receiving
 * every other prompt a release adds. The cost is that a misnamed override would
 * be indistinguishable from no override, so the one likely misnaming — a case
 * difference — is refused rather than fallen back from. See spec Section 16.
 *
 * The check is made against a directory listing rather than by trying to open
 * the file, because opening `aiHandoff.md` succeeds on a case-insensitive
 * filesystem even when the file on disk is `aiHandoff.MD`.
 */
export function templateResolver(
  opts: { contentRoot?: string; bundledPromptsDir: string },
  probe: DirectoryProbe,
): TemplateResolver {
  return async (workflowId, stepId) => {
    const expected = `${stepId}.md`
    const bundled: ResolvedTemplate = {
      path: join(opts.bundledPromptsDir, workflowId, expected),
      source: 'bundled',
    }

    if (!opts.contentRoot) return bundled

    const dir = join(promptsDirOf(opts.contentRoot), workflowId)
    const names = await probe.list(dir)
    if (!names) return bundled

    if (names.includes(expected)) return { path: join(dir, expected), source: 'external' }

    const variant = names.find((n) => n.toLowerCase() === expected.toLowerCase())
    if (variant) {
      throw new Error(`found "${variant}" in ${dir}, expected "${expected}"`)
    }

    return bundled
  }
}

/** Workflows are not configurable; a folder of them is a misunderstanding worth reporting. */
export async function externalWorkflowsPresent(
  root: string,
  probe: DirectoryProbe,
): Promise<boolean> {
  return (await probe.list(join(root, 'workflows'))) !== undefined
}

/** The caption above a composed prompt, so silent fallback is visible on screen. */
export function templateNote(t: ResolvedTemplate): string {
  return `Template: ${t.path} (${t.source === 'external' ? 'external' : 'bundled default'})`
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run test/content/ContentRoot.test.ts`
Expected: PASS, 23 tests

- [ ] **Step 9: Run the full gate**

Run: `npm run verify`
Expected: PASS. 401 tests across 31 files — the 378 that passed before, plus this file's 23.

- [ ] **Step 10: Commit**

```bash
git add src/content/ContentRoot.ts test/content/ContentRoot.test.ts
git commit -m "feat(content): resolve the content root and prompt templates

Pure module behind the aiDevWorkflow.contentRoot setting. Nothing imports
it yet. Per-file prompt fallback, with a case-difference guard so a
misnamed override fails loudly instead of resolving to the bundled
default. See spec Section 16."
```
