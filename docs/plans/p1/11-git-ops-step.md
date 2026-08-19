# Task 11: GitOpsStep

> Part of the [Phase 1 implementation plan](README.md). Completed and shipped.

**Files:**
- Create: `src/steps/GitOpsStep.ts`, `src/git/GitRunner.ts`
- Modify: `src/steps/registry.ts`
- Test: `test/steps/GitOpsStep.test.ts`

**Interfaces:**
- Produces: `interface GitRunner { run(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> }`
- Produces: `class ExecGitRunner implements GitRunner`
- Produces: `new GitOpsStep(runner: GitRunner, codeRoot: string)`; `execute` returns `{ repos: { name: string; path: string }[]; branch: string }`

- [ ] **Step 1: Write the failing test with a fake runner**

```typescript
// test/steps/GitOpsStep.test.ts
import { describe, it, expect } from 'vitest'
import { GitOpsStep } from '../../src/steps/GitOpsStep'
import type { StepDef } from '../../src/engine/schema'

class FakeGit {
  calls: string[][] = []
  async run(args: string[]) { this.calls.push(args); return { code: 0, stdout: '', stderr: '' } }
}

const platform = { id: 'p', label: 'P', services: [
  { id: 'payments', label: 'Payments', gitUrl: 'git@x:payments.git' },
  { id: 'orders',   label: 'Orders',   gitUrl: 'git@x:orders.git' },
]}

const step: StepDef = {
  id: 'checkout', kind: 'git-ops', title: 'Get the code',
  repos: '{{scope.services}}', ops: ['clone', 'checkout'], branch: '{{task.epic}}-research',
}

const ctx = {
  platform, taskDir: '/tmp/t',
  answersOf: (id: string) => id === 'scope' ? { services: ['payments'] } : {},
  epic: 'PLAT-1234',
}

describe('GitOpsStep', () => {
  it('clones only the selected services', async () => {
    const git = new FakeGit()
    const result = await new GitOpsStep(git, '/code').execute(step, ctx as never, {})
    expect(git.calls[0]).toEqual(['clone', 'git@x:payments.git', '/code/payments'])
    expect(result.repos).toEqual([{ name: 'payments', path: '/code/payments' }])
  })

  it('resolves the branch placeholder from the task epic', async () => {
    const git = new FakeGit()
    await new GitOpsStep(git, '/code').execute(step, ctx as never, {})
    expect(git.calls.some(c => c.includes('PLAT-1234-research'))).toBe(true)
  })

  it('reports a failed operation rather than throwing', async () => {
    const failing = { async run() { return { code: 128, stdout: '', stderr: 'fatal: repo not found' } } }
    const result = await new GitOpsStep(failing, '/code').execute(step, ctx as never, {})
    expect(result.failures).toHaveLength(1)
    expect(String(result.failures[0].stderr)).toContain('repo not found')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/steps/GitOpsStep.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/git/GitRunner.ts` and `src/steps/GitOpsStep.ts`**

```typescript
// src/git/GitRunner.ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const run = promisify(execFile)

export interface GitResult { code: number; stdout: string; stderr: string }
export interface GitRunner { run(args: string[], cwd?: string): Promise<GitResult> }

export class ExecGitRunner implements GitRunner {
  async run(args: string[], cwd?: string): Promise<GitResult> {
    try {
      const { stdout, stderr } = await run('git', args, { cwd })
      return { code: 0, stdout, stderr }
    } catch (err) {
      const e = err as { code?: number; stdout?: string; stderr?: string }
      return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? String(err) }
    }
  }
}
```

```typescript
// src/steps/GitOpsStep.ts
import { join } from 'node:path'
import type { StepDef } from '../engine/schema'
import type { GitRunner, GitResult } from '../git/GitRunner'
import type { Answers, StepContext, StepHandler, StepView, ValidationResult } from './StepHandler'

export class GitOpsStep implements StepHandler {
  readonly kind = 'git-ops' as const

  constructor(private readonly git: GitRunner, private readonly codeRoot: string) {}

  describe(step: StepDef, _ctx: StepContext, _values: Answers): StepView {
    return {
      text: `This will run ${(step.ops ?? []).join(', ')} on the repositories you selected.`,
      actions: [{ id: 'back', label: 'Back' }, { id: 'submit', label: 'Run git commands', primary: true }],
    }
  }

  validate(): ValidationResult { return { ok: true, errors: {} } }

  async execute(step: StepDef, ctx: StepContext, _values: Answers): Promise<Record<string, unknown>> {
    const selected = resolveRepos(step.repos ?? '', ctx)
    const branch = resolvePlaceholders(step.branch ?? '', ctx)
    const repos: { name: string; path: string }[] = []
    const failures: (GitResult & { repo: string; op: string })[] = []

    for (const id of selected) {
      const service = ctx.platform.services.find(s => s.id === id)
      if (!service) continue
      const path = join(this.codeRoot, service.id)

      for (const op of step.ops ?? []) {
        const args =
          op === 'clone'    ? ['clone', service.gitUrl, path] :
          op === 'checkout' ? ['checkout', '-B', branch] :
          op === 'branch'   ? ['branch', branch] :
                              ['pull']
        const cwd = op === 'clone' ? undefined : path
        const result = await this.git.run(args, cwd)
        if (result.code !== 0) failures.push({ ...result, repo: service.id, op })
      }
      repos.push({ name: service.id, path })
    }
    return { repos, branch, failures }
  }
}

function resolveRepos(expr: string, ctx: StepContext): string[] {
  const m = /^\{\{([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\}\}$/.exec(expr.trim())
  if (!m) return []
  const value = ctx.answersOf(m[1]!)[m[2]!]
  return Array.isArray(value) ? value.map(String) : []
}

function resolvePlaceholders(text: string, ctx: StepContext): string {
  return text.replace(/\{\{task\.epic\}\}/g, ctx.epic)
             .replace(/\{\{([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\}\}/g,
                      (_, ns: string, f: string) => String(ctx.answersOf(ns)[f] ?? ''))
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/steps/GitOpsStep.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Register the handler**

`StepContext` already carries `epic` and `taskId` from Task 4, so no step needs its own
context type. In `src/steps/registry.ts`:

```typescript
export const defaultHandlers = (ctx: StepContext): StepHandler[] => [
  new FormStep(),
  new GitOpsStep(new ExecGitRunner(), join(homedir(), 'ai-dev-workflow', 'code')),
]
```

Update `TaskSession.open` to include `epic: state.epic` in `ctx`.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run && npm run lint`
Expected: all PASS, lint clean.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: git operations step"
```
