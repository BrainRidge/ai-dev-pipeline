# Task 12: Prompt composition

> Part of the [Phase 1 implementation plan](README.md). Completed and shipped.

**Files:**
- Create: `src/prompt/PromptComposer.ts`
- Test: `test/prompt/PromptComposer.test.ts`

**Interfaces:**
- Produces: `new PromptComposer(templateDir: string)`, `composer.compose(step, ctx, repos): Promise<string>`
- Produces: the four-part order from spec Section 8 — template, path map, scope constraint, output contract

- [ ] **Step 1: Write the failing test**

```typescript
// test/prompt/PromptComposer.test.ts
import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PromptComposer } from '../../src/prompt/PromptComposer'

const TEMPLATE = `Analysing for {{task.platform}}.
Question: {{scope.question}}
Story: {{context.story}}
`

async function composer() {
  const dir = await mkdtemp(join(tmpdir(), 'pr-'))
  await writeFile(join(dir, 'research-analysis.md'), TEMPLATE)
  return new PromptComposer(dir)
}

const ctx = {
  platform: { id: 'canada-assisted', label: 'CA', services: [] },
  taskDir: '/tasks/T-1', epic: 'PLAT-1', taskId: 'T-1',
  answersOf: (id: string) => ({
    scope: { question: 'why is it slow' }, context: { story: 'PLAT-1 body' },
  } as Record<string, Record<string, unknown>>)[id] ?? {},
}

const step = { id: 'analyse', kind: 'ai-handoff' as const, title: 'Analyse',
               prompt: 'research-analysis.md', output: '02-analysis.md' }
const repos = [{ name: 'payments', path: '/code/payments' }]

describe('PromptComposer', () => {
  it('resolves step and task placeholders', async () => {
    const p = await (await composer()).compose(step, ctx as never, repos)
    expect(p).toContain('Analysing for canada-assisted.')
    expect(p).toContain('Question: why is it slow')
    expect(p).toContain('Story: PLAT-1 body')
  })

  it('appends the four parts in order', async () => {
    const p = await (await composer()).compose(step, ctx as never, repos)
    const iTemplate = p.indexOf('Analysing for')
    const iPaths    = p.indexOf('/code/payments')
    const iScope    = p.indexOf('Work only within')
    const iOutput   = p.indexOf('02-analysis.md')
    expect(iTemplate).toBeLessThan(iPaths)
    expect(iPaths).toBeLessThan(iScope)
    expect(iScope).toBeLessThan(iOutput)
  })

  it('emits #file references for each repo', async () => {
    const p = await (await composer()).compose(step, ctx as never, repos)
    expect(p).toContain('#file:/code/payments')
  })

  it('is deterministic', async () => {
    const c = await composer()
    expect(await c.compose(step, ctx as never, repos)).toBe(await c.compose(step, ctx as never, repos))
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/prompt/PromptComposer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/prompt/PromptComposer.ts`**

```typescript
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { StepDef } from '../engine/schema'
import type { StepContext } from '../steps/StepHandler'

/** Assembles the prompt deterministically in four parts (spec Section 8).
 *  Parts 2-4 are generated here so prompt authors write only the thinking. */
export class PromptComposer {
  constructor(private readonly templateDir: string) {}

  async compose(
    step: StepDef, ctx: StepContext, repos: { name: string; path: string }[],
  ): Promise<string> {
    const template = await readFile(join(this.templateDir, step.prompt!), 'utf8')

    const part1 = resolve(template, ctx)
    const part2 = [
      '', '## Repositories in scope', '',
      ...repos.map(r => `- **${r.name}** — \`${r.path}\` #file:${r.path}`),
    ].join('\n')
    const part3 = [
      '', '## Scope', '',
      `Work only within the repositories listed above. Do not modify files elsewhere.`,
    ].join('\n')
    const part4 = [
      '', '## Required output', '',
      `Write your result to \`${join(ctx.taskDir, step.output!)}\`.`,
      `Create the file if it does not exist. Do not write your result anywhere else.`,
    ].join('\n')

    return [part1.trimEnd(), part2, part3, part4, ''].join('\n')
  }
}

function resolve(text: string, ctx: StepContext): string {
  return text.replace(/\{\{([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\}\}/g, (_, ns: string, field: string) => {
    if (ns === 'task') {
      if (field === 'platform') return ctx.platform.id
      if (field === 'epic') return ctx.epic
      if (field === 'dir') return ctx.taskDir
      if (field === 'id') return ctx.taskId
      return ''
    }
    const value = ctx.answersOf(ns)[field]
    return Array.isArray(value) ? value.join(', ') : String(value ?? '')
  })
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/prompt/PromptComposer.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: deterministic prompt composition"
```
