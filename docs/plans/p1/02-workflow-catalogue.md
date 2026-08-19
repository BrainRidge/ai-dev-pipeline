# Task 2: Workflow schema and catalogue

> Part of the [Phase 1 implementation plan](README.md). Completed and shipped.

**Files:**
- Create: `src/engine/schema.ts`, `src/engine/WorkflowCatalog.ts`
- Test: `test/engine/schema.test.ts`, `test/engine/catalog.test.ts`

**Interfaces:**
- Produces: all types in Global Constraints; `WorkflowCatalog.load(dir: string): Promise<WorkflowCatalog>`, `catalog.get(id: string): WorkflowDef`, `catalog.forPlatform(p: string): WorkflowDef[]`, `catalog.platforms(): PlatformDef[]`
- Produces: `interface PlatformDef { id: string; label: string; services: ServiceDef[] }`, `interface ServiceDef { id: string; label: string; gitUrl: string }`

- [ ] **Step 1: Write the failing schema test**

```typescript
// test/engine/schema.test.ts
import { describe, it, expect } from 'vitest'
import { workflowSchema } from '../../src/engine/schema'

describe('workflowSchema', () => {
  it('accepts a minimal valid workflow', () => {
    const parsed = workflowSchema.parse({
      id: 'research', label: 'Research Task', platforms: ['canada-assisted'],
      steps: [{ id: 'scope', kind: 'form', title: 'Scope',
                fields: [{ id: 'q', type: 'textarea', label: 'Question', required: true }] }],
    })
    expect(parsed.steps[0]!.kind).toBe('form')
  })

  it('rejects an unknown step kind', () => {
    expect(() => workflowSchema.parse({
      id: 'x', label: 'X', platforms: ['p'],
      steps: [{ id: 's', kind: 'teleport', title: 'T' }],
    })).toThrow()
  })

  it('rejects duplicate step ids', () => {
    expect(() => workflowSchema.parse({
      id: 'x', label: 'X', platforms: ['p'],
      steps: [{ id: 's', kind: 'confirm', title: 'A' }, { id: 's', kind: 'confirm', title: 'B' }],
    })).toThrow(/duplicate/i)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/engine/schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/engine/schema.ts`**

```typescript
import { z } from 'zod'

export const fieldSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['text', 'textarea', 'select', 'multiselect', 'boolean', 'repo-picker', 'file-picker']),
  label: z.string().min(1),
  required: z.boolean().optional(),
  source: z.string().optional(),
  provider: z.string().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
})

export const stepSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['form', 'git-ops', 'ai-handoff', 'artifact-review', 'confirm']),
  title: z.string().min(1),
  when: z.string().optional(),
  fields: z.array(fieldSchema).optional(),
  repos: z.string().optional(),
  ops: z.array(z.enum(['clone', 'checkout', 'branch', 'pull'])).optional(),
  branch: z.string().optional(),
  prompt: z.string().optional(),
  output: z.string().optional(),
  artifact: z.string().optional(),
  onRevise: z.string().optional(),
  text: z.string().optional(),
})

export const workflowSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  platforms: z.array(z.string()).min(1),
  steps: z.array(stepSchema).min(1),
}).superRefine((wf, ctx) => {
  const seen = new Set<string>()
  for (const s of wf.steps) {
    if (seen.has(s.id)) ctx.addIssue({ code: 'custom', message: `duplicate step id: ${s.id}` })
    seen.add(s.id)
  }
  for (const s of wf.steps) {
    if (s.onRevise && !seen.has(s.onRevise)) {
      ctx.addIssue({ code: 'custom', message: `onRevise references unknown step: ${s.onRevise}` })
    }
  }
})

export const serviceSchema = z.object({ id: z.string(), label: z.string(), gitUrl: z.string() })
export const platformSchema = z.object({ id: z.string(), label: z.string(), services: z.array(serviceSchema) })
export const platformsFileSchema = z.object({ platforms: z.array(platformSchema) })

export type FieldDef = z.infer<typeof fieldSchema>
export type StepDef = z.infer<typeof stepSchema>
export type WorkflowDef = z.infer<typeof workflowSchema>
export type ServiceDef = z.infer<typeof serviceSchema>
export type PlatformDef = z.infer<typeof platformSchema>
export type StepKind = StepDef['kind']
export type FieldType = FieldDef['type']
```

- [ ] **Step 4: Run the schema test**

Run: `npx vitest run test/engine/schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing catalogue test**

```typescript
// test/engine/catalog.test.ts
import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkflowCatalog } from '../../src/engine/WorkflowCatalog'

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  await writeFile(join(dir, 'platforms.yaml'),
    'platforms:\n  - id: canada-assisted\n    label: Canada Assisted\n    services:\n' +
    '      - { id: payments, label: Payments, gitUrl: "git@example.com:payments.git" }\n')
  await writeFile(join(dir, 'research.yaml'),
    'id: research\nlabel: Research Task\nplatforms: [canada-assisted]\nsteps:\n' +
    '  - id: scope\n    kind: form\n    title: Scope\n' +
    '    fields: [{ id: question, type: textarea, label: Question }]\n' +
    '  - id: analyse\n    kind: ai-handoff\n    title: Analyse\n' +
    '    prompt: prompts/x.md\n    output: 02-analysis.md\n')
  return dir
}

describe('WorkflowCatalog', () => {
  it('loads workflows and platforms', async () => {
    const c = await WorkflowCatalog.load(await fixture())
    expect(c.get('research').label).toBe('Research Task')
    expect(c.platforms()[0]!.services[0]!.id).toBe('payments')
  })

  it('filters workflows by platform', async () => {
    const c = await WorkflowCatalog.load(await fixture())
    expect(c.forPlatform('canada-assisted').map(w => w.id)).toEqual(['research'])
    expect(c.forPlatform('us-assisted')).toEqual([])
  })

  it('rejects a placeholder referencing an unknown step', async () => {
    const dir = await fixture()
    await writeFile(join(dir, 'bad.yaml'),
      'id: bad\nlabel: Bad\nplatforms: [canada-assisted]\nsteps:\n' +
      '  - id: a\n    kind: ai-handoff\n    title: A\n    prompt: p.md\n    output: o.md\n' +
      '    branch: "{{nosuch.field}}"\n')
    await expect(WorkflowCatalog.load(dir)).rejects.toThrow(/nosuch/)
  })
})
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npx vitest run test/engine/catalog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `src/engine/WorkflowCatalog.ts`**

```typescript
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { workflowSchema, platformsFileSchema, type WorkflowDef, type PlatformDef } from './schema'

const PLACEHOLDER = /\{\{([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+)\}\}/g
const TASK_FIELDS = new Set(['platform', 'epic', 'dir', 'id'])

export class WorkflowCatalog {
  private constructor(
    private readonly workflows: Map<string, WorkflowDef>,
    private readonly platformDefs: PlatformDef[],
  ) {}

  static async load(dir: string): Promise<WorkflowCatalog> {
    const platforms = platformsFileSchema.parse(parse(await readFile(join(dir, 'platforms.yaml'), 'utf8'))).platforms

    const workflows = new Map<string, WorkflowDef>()
    for (const name of await readdir(dir)) {
      if (!name.endsWith('.yaml') || name === 'platforms.yaml') continue
      const wf = workflowSchema.parse(parse(await readFile(join(dir, name), 'utf8')))
      validatePlaceholders(wf)
      workflows.set(wf.id, wf)
    }
    return new WorkflowCatalog(workflows, platforms)
  }

  get(id: string): WorkflowDef {
    const wf = this.workflows.get(id)
    if (!wf) throw new Error(`unknown workflow: ${id}`)
    return wf
  }

  forPlatform(platform: string): WorkflowDef[] {
    return [...this.workflows.values()].filter(w => w.platforms.includes(platform))
  }

  platforms(): PlatformDef[] { return this.platformDefs }
}

function validatePlaceholders(wf: WorkflowDef): void {
  const seen = new Set<string>()
  for (const step of wf.steps) {
    const text = JSON.stringify(step)
    for (const [, ns, field] of text.matchAll(PLACEHOLDER)) {
      if (ns === 'task') {
        if (!TASK_FIELDS.has(field!)) throw new Error(`unknown task placeholder: task.${field}`)
        continue
      }
      if (!seen.has(ns!)) {
        throw new Error(`placeholder {{${ns}.${field}}} in step "${step.id}" references a step that has not completed`)
      }
    }
    seen.add(step.id)
  }
}
```

- [ ] **Step 8: Run the catalogue test**

Run: `npx vitest run test/engine/catalog.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: workflow schema and catalogue with placeholder validation"
```
