# Task 1: PromptComposer resolves through the content root

> Part of the [External content implementation plan](README.md).

The one real interface change in this plan. `PromptComposer` stops taking a
directory and starts taking a `TemplateResolver`, which means it no longer knows
or cares whether a template came from the team's folder or from the bundle — it
just reports which. `path()` becomes `resolved()` and is now async, because
resolution reads a directory.

Because the constructor changes, **every construction site must be updated in
this same task** or the tree does not typecheck. There are nine: three in
`src/tasks/registry.ts` and six across the tests.

`src/session/TaskSession.ts` is touched here only to keep it compiling — it
passes `contentRoot: undefined`, preserving today's behaviour exactly. Task 3 is
what makes it read the setting.

**Files:**
- Modify: `src/prompt/PromptComposer.ts`
- Modify: `src/tasks/registry.ts` — `buildTaskTypes`
- Modify: `src/tasks/InvokeCopilot.ts` — `deliver`, the `if (!outputFile)` branch
- Modify: `src/session/TaskSession.ts` — the `buildTaskTypes` call in `TaskSession.open`
- Modify: `test/support/fixtures.ts`
- Modify: `test/prompt/PromptComposer.test.ts` — the `composer` helper
- Modify: `test/workflow/researchTaskWorkflow.test.ts:55`
- Modify: `test/workflow/bugFixWorkflow.test.ts:46`
- Modify: `test/workflow/newFeatureWorkflow.test.ts:46`
- Modify: `test/workflow/secondWorkflow.test.ts:85,105`

**Interfaces:**
- Consumes: `TemplateResolver`, `ResolvedTemplate`, `templateResolver`, `nodeProbe` (Task 0)
- Produces:
  - `PromptComposer.constructor(resolve: TemplateResolver)`
  - `PromptComposer.resolved(step: StepDef, ctx: StepContext): Promise<ResolvedTemplate>` — **replaces `path()`**
  - `PromptComposer.compose(...): Promise<ComposedPrompt>` — now also carries `templatePath` and `templateSource`
  - `buildTaskTypes(opts: { contentRoot: string | undefined; bundledPromptsDir: string; taskDir: string; codeRoot: string })` — **replaces `promptDir`**
  - `bundledResolver(promptsDir: string): TemplateResolver` in `test/support/fixtures.ts`

---

- [ ] **Step 1: Add the test helper the other tests will need**

Append to `test/support/fixtures.ts`:

```typescript
import {
  nodeProbe,
  templateResolver,
  type TemplateResolver,
} from '../../src/content/ContentRoot'

/**
 * A resolver with no content root, so every template resolves to the given
 * directory. This is what `PromptComposer` did on its own before the content
 * root existed, and it keeps tests that do not care about resolution short.
 */
export function bundledResolver(promptsDir: string): TemplateResolver {
  return templateResolver({ bundledPromptsDir: promptsDir }, nodeProbe)
}
```

- [ ] **Step 2: Write the failing tests for provenance on the composed prompt**

Append to `test/prompt/PromptComposer.test.ts`:

`mkdtemp`, `mkdir`, `writeFile`, `join`, `tmpdir`, `TEMPLATE`, `handoff`, `ctx`
and `repos` are all already in scope at the top of this file. Add one import:

```typescript
import { templateResolver, nodeProbe } from '../../src/content/ContentRoot'

/**
 * A bundled directory and a team directory, so resolution has something to
 * choose between. Returns both paths so tests can assert which one won.
 */
async function twoSources(opts: { external?: string }): Promise<{
  composer: PromptComposer
  bundledDir: string
  contentRoot: string
}> {
  const bundledDir = await mkdtemp(join(tmpdir(), 'bundled-'))
  await mkdir(join(bundledDir, 'researchTaskWorkflow'), { recursive: true })
  await writeFile(join(bundledDir, 'researchTaskWorkflow', 'aiHandoff.md'), TEMPLATE)

  const contentRoot = await mkdtemp(join(tmpdir(), 'team-'))
  if (opts.external !== undefined) {
    await mkdir(join(contentRoot, 'prompts', 'researchTaskWorkflow'), { recursive: true })
    await writeFile(
      join(contentRoot, 'prompts', 'researchTaskWorkflow', 'aiHandoff.md'),
      opts.external,
    )
  }

  return {
    composer: new PromptComposer(
      templateResolver({ contentRoot, bundledPromptsDir: bundledDir }, nodeProbe),
    ),
    bundledDir,
    contentRoot,
  }
}

describe('where the template came from', () => {
  it('reports the bundled template when the team supplied none', async () => {
    const { composer, bundledDir } = await twoSources({})
    const composed = await composer.compose(handoff, ctx, repos)
    expect(composed.templateSource).toBe('bundled')
    expect(composed.templatePath).toBe(
      join(bundledDir, 'researchTaskWorkflow', 'aiHandoff.md'),
    )
  })

  it("uses and reports the team's template when they supplied one", async () => {
    const { composer, contentRoot } = await twoSources({
      external: '---\noutput: 02-analysis.md\n---\nOur own wording for {{task.epic}}.\n',
    })
    const composed = await composer.compose(handoff, ctx, repos)
    expect(composed.templateSource).toBe('external')
    expect(composed.templatePath).toBe(
      join(contentRoot, 'prompts', 'researchTaskWorkflow', 'aiHandoff.md'),
    )
    expect(composed.prompt).toContain('Our own wording for PLAT-1234.')
  })

  it('takes the output contract from whichever template won', async () => {
    const { composer } = await twoSources({
      external: '---\noutput: our-analysis.md\n---\nBody.\n',
    })
    expect(await composer.outputFor(handoff, ctx)).toBe('our-analysis.md')
  })

  it('answers resolved() without composing, for callers that only need the path', async () => {
    const { composer, contentRoot } = await twoSources({ external: 'Body.\n' })
    expect(await composer.resolved(handoff, ctx)).toEqual({
      path: join(contentRoot, 'prompts', 'researchTaskWorkflow', 'aiHandoff.md'),
      source: 'external',
    })
  })

  // The guard from Task 0, seen from where a developer would actually hit it.
  it('surfaces a case-mismatched override as a composition failure', async () => {
    const bundledDir = await mkdtemp(join(tmpdir(), 'bundled-'))
    await mkdir(join(bundledDir, 'researchTaskWorkflow'), { recursive: true })
    await writeFile(join(bundledDir, 'researchTaskWorkflow', 'aiHandoff.md'), TEMPLATE)

    const contentRoot = await mkdtemp(join(tmpdir(), 'team-'))
    await mkdir(join(contentRoot, 'prompts', 'researchTaskWorkflow'), { recursive: true })
    await writeFile(
      join(contentRoot, 'prompts', 'researchTaskWorkflow', 'aiHandoff.MD'),
      'Body.\n',
    )

    const composer = new PromptComposer(
      templateResolver({ contentRoot, bundledPromptsDir: bundledDir }, nodeProbe),
    )
    await expect(composer.compose(handoff, ctx, repos)).rejects.toThrow(
      /found "aiHandoff\.MD".*expected "aiHandoff\.md"/,
    )
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/prompt/PromptComposer.test.ts`
Expected: FAIL — `templateSource` is undefined, and `composer.resolved is not a function`

- [ ] **Step 4: Change PromptComposer to resolve rather than join**

In `src/prompt/PromptComposer.ts`, replace the imports, the `ComposedPrompt` and
`Template` interfaces, the constructor, `outputFor`, the tail of `compose`, and
`path`:

```typescript
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import type { StepDef } from '../engine/schema'
import type { StepContext } from '../tasks/context'
import { resolveText } from '../engine/placeholders'
import type { ResolvedTemplate, TemplateResolver, TemplateSource } from '../content/ContentRoot'

export interface ComposedPrompt {
  prompt: string
  /**
   * The artifact the model is contracted to write, relative to the task dir.
   * Absent for a handoff that produces edits rather than a document.
   */
  outputFile?: string
  /** Which file this prompt was built from, and whose it was. See spec Section 16. */
  templatePath: string
  templateSource: TemplateSource
}

interface Template {
  body: string
  outputFile?: string
  path: string
  source: TemplateSource
}
```

The class then takes a resolver:

```typescript
export class PromptComposer {
  constructor(private readonly resolve: TemplateResolver) {}

  /**
   * Which template this step will use, and whether it is the team's or the
   * bundled default — without reading or composing it. The panel needs this to
   * caption the prompt, and `InvokeCopilot` needs it to name the file in an
   * error. See spec Section 16.
   */
  async resolved(step: StepDef, ctx: StepContext): Promise<ResolvedTemplate> {
    return this.resolve(ctx.workflowId, step.id)
  }

  async outputFor(step: StepDef, ctx: StepContext): Promise<string> {
    const { outputFile, path } = await this.template(step, ctx)
    if (!outputFile) {
      throw new Error(`prompt template "${path}" must declare "output:" in its frontmatter`)
    }
    return outputFile
  }
```

`compose` keeps parts 1–4 exactly as they are; only its first and last statements change:

```typescript
  async compose(
    step: StepDef,
    ctx: StepContext,
    repos: { name: string; path: string }[],
  ): Promise<ComposedPrompt> {
    const { body, outputFile, path, source } = await this.template(step, ctx)

    // ... parts 1-4 unchanged ...

    return {
      prompt: [part1.trimEnd(), part2, part3, part4, ''].join('\n'),
      outputFile,
      templatePath: path,
      templateSource: source,
    }
  }
```

And `template` resolves instead of joining. Delete the old `path()` method:

```typescript
  private async template(step: StepDef, ctx: StepContext): Promise<Template> {
    const { path, source } = await this.resolved(step, ctx)
    const raw = await readFile(path, 'utf8')

    const match = FRONTMATTER.exec(raw)
    if (!match) return { body: raw, path, source }

    const meta = parse(match[1]!) as { output?: unknown } | null
    const declared = meta?.output
    if (declared !== undefined && (typeof declared !== 'string' || declared.trim() === '')) {
      throw new Error(`prompt template "${path}" declares an unusable "output:" value`)
    }

    return {
      body: raw.slice(match[0].length),
      outputFile: typeof declared === 'string' ? declared.trim() : undefined,
      path,
      source,
    }
  }
}
```

- [ ] **Step 5: Update the one caller of the old `path()`**

In `src/tasks/InvokeCopilot.ts`, `deliver` builds an error naming the template.
Replace lines 92–97:

```typescript
    if (!outputFile) {
      const { path } = await this.composer.resolved(step, ctx)
      throw new Error(
        `prompt template "${path}" must declare "output:" — ` +
          `step "${step.id}" completes only when that file appears`,
      )
    }
```

- [ ] **Step 6: Build the resolver once in the registry**

In `src/tasks/registry.ts`, add the import and replace the three separate
`new PromptComposer(opts.promptDir)` calls with one shared instance. The composer
is stateless, so one is correct and three were only ever incidental:

```typescript
import { nodeProbe, templateResolver } from '../content/ContentRoot'
```

```typescript
export function buildTaskTypes(opts: {
  /** The team's folder, or undefined when the setting is unset. */
  contentRoot: string | undefined
  /** The prompts shipped in the extension, used wherever the team supplied none. */
  bundledPromptsDir: string
  taskDir: string
  codeRoot: string
}): TaskTypeRegistry {
  const composer = new PromptComposer(
    templateResolver(
      { contentRoot: opts.contentRoot, bundledPromptsDir: opts.bundledPromptsDir },
      nodeProbe,
    ),
  )
```

Then pass `composer` in place of each `new PromptComposer(opts.promptDir)` in the
three handoff constructions.

- [ ] **Step 7: Keep TaskSession compiling, without changing its behaviour**

In `src/session/TaskSession.ts`, replace the `buildTaskTypes` call at line 240:

```typescript
    const registry = buildTaskTypes({
      // Task 3 replaces this with the aiDevWorkflow.contentRoot setting.
      contentRoot: undefined,
      bundledPromptsDir: join(context.extensionPath, 'prompts'),
      taskDir: ws.dir,
      codeRoot: resolveCodeRoot(config<string>('codeRoot')),
    })
```

- [ ] **Step 8: Update the six test construction sites**

In `test/prompt/PromptComposer.test.ts`, change the `composer` helper's last line:

```typescript
import { bundledResolver, context, step } from '../support/fixtures'
```

```typescript
  return new PromptComposer(bundledResolver(dir))
```

In each of `test/workflow/researchTaskWorkflow.test.ts:55`,
`test/workflow/bugFixWorkflow.test.ts:46` and
`test/workflow/newFeatureWorkflow.test.ts:46`, import `bundledResolver` from
`../support/fixtures` and wrap the argument:

```typescript
new PromptComposer(bundledResolver(join(ROOT, 'prompts')))
```

In `test/workflow/secondWorkflow.test.ts`, do the same at both sites:

```typescript
new PromptComposer(bundledResolver('/unused'))
```

```typescript
new PromptComposer(bundledResolver(join(dir, 'prompts')))
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run test/prompt test/workflow test/tasks`
Expected: PASS. Confirm no construction site was missed:

```bash
grep -rn "new PromptComposer(" src test | grep -v "bundledResolver\|templateResolver"
```

Expected: no output.

- [ ] **Step 10: Run the full gate**

Run: `npm run verify`
Expected: PASS, 406 tests

- [ ] **Step 11: Rebuild the tracked bundles**

Run: `npm run build`

- [ ] **Step 12: Commit**

```bash
git add src/prompt/PromptComposer.ts src/tasks/registry.ts src/tasks/InvokeCopilot.ts \
        src/session/TaskSession.ts test/ out/
git commit -m "refactor(prompt): compose from a resolved template, not a fixed directory

PromptComposer takes a TemplateResolver and reports which template a
prompt was built from. path() becomes the async resolved(). Behaviour is
unchanged until Task 3 wires the setting in. See spec Section 16."
```
