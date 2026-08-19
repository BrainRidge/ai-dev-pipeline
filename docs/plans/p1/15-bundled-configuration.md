# Task 15: Bundled configuration content

> Part of the [Phase 1 implementation plan](README.md). Completed and shipped.

**Files:**
- Create: `workflows/platforms.yaml`, `workflows/research.yaml`, `prompts/research-analysis.md`
- Test: `test/config/bundled.test.ts`

- [ ] **Step 1: Write the failing test that validates the real bundled files**

```typescript
// test/config/bundled.test.ts
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { WorkflowCatalog } from '../../src/engine/WorkflowCatalog'

describe('bundled configuration', () => {
  it('loads and validates', async () => {
    const c = await WorkflowCatalog.load(join(__dirname, '../../workflows'))
    expect(c.get('research').steps.map(s => s.id))
      .toEqual(['scope', 'checkout', 'context', 'analyse', 'review'])
  })

  it('defines all four platforms', async () => {
    const c = await WorkflowCatalog.load(join(__dirname, '../../workflows'))
    expect(c.platforms().map(p => p.id).sort()).toEqual(
      ['canada-assisted', 'canada-self-serve', 'us-assisted', 'us-self-serve'])
  })

  it('offers research on every platform', async () => {
    const c = await WorkflowCatalog.load(join(__dirname, '../../workflows'))
    for (const p of c.platforms()) {
      expect(c.forPlatform(p.id).map(w => w.id)).toContain('research')
    }
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/config/bundled.test.ts`
Expected: FAIL — `platforms.yaml` not found.

- [ ] **Step 3: Create `workflows/platforms.yaml`**

Service lists are placeholders for the tool developers to fill with real repositories — the structure is what this task delivers.

```yaml
platforms:
  - id: canada-assisted
    label: Canada Assisted Platform
    services:
      - { id: payments, label: Payments Service, gitUrl: "git@github.com:org/ca-payments.git" }
      - { id: orders,   label: Orders Service,   gitUrl: "git@github.com:org/ca-orders.git" }
  - id: canada-self-serve
    label: Canada Self-serve Platform
    services:
      - { id: portal,   label: Customer Portal,  gitUrl: "git@github.com:org/ca-portal.git" }
  - id: us-assisted
    label: US Assisted Platform
    services:
      - { id: payments, label: Payments Service, gitUrl: "git@github.com:org/us-payments.git" }
  - id: us-self-serve
    label: US Self-serve Platform
    services:
      - { id: portal,   label: Customer Portal,  gitUrl: "git@github.com:org/us-portal.git" }
```

- [ ] **Step 4: Create `workflows/research.yaml`**

```yaml
id: research
label: Research Task
platforms: [canada-assisted, canada-self-serve, us-assisted, us-self-serve]

steps:
  - id: scope
    kind: form
    title: What are we researching?
    fields:
      - { id: services, type: multiselect, label: Microservices to research,
          source: platform.services, required: true }
      - { id: question, type: textarea, label: Research question, required: true }

  - id: checkout
    kind: git-ops
    title: Get the code
    repos: "{{scope.services}}"
    ops: [clone, checkout]
    branch: "{{task.epic}}-research"

  - id: context
    kind: form
    title: Supporting context
    fields:
      - { id: story, type: textarea, label: JIRA story, provider: manual }
      - { id: docs,  type: textarea, label: Links to other documentation }
      - { id: notes, type: textarea, label: Notes from calls or conversations }

  - id: analyse
    kind: ai-handoff
    title: Run the analysis
    prompt: research-analysis.md
    output: 02-analysis.md

  - id: review
    kind: artifact-review
    title: Review the analysis
    artifact: 02-analysis.md
    onRevise: analyse
```

- [ ] **Step 5: Create `prompts/research-analysis.md`**

```markdown
You are helping a developer research an existing system before any code is written.
Platform: {{task.platform}}. Epic: {{task.epic}}.

## Research question

{{scope.question}}

## JIRA story

{{context.story}}

## Other documentation

{{context.docs}}

## Notes from calls and conversations

{{context.notes}}

## What to produce

Read the repositories in scope and answer the research question. Structure your
analysis with exactly these headings:

1. **Summary** — three sentences answering the research question directly.
2. **How it works today** — the current behaviour, with file references.
3. **Relevant entry points** — the specific classes, endpoints or handlers involved.
4. **Constraints and risks** — what would make a change here difficult or dangerous.
5. **Open questions** — what you could not determine from the code, and what the
   developer would need to find out from a person.

Prefer specific file and line references over general description. If the code
contradicts the JIRA story or the notes, say so explicitly under Open questions —
that contradiction is usually the most valuable thing in the analysis.
```

- [ ] **Step 6: Run the test**

Run: `npx vitest run test/config/bundled.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: bundled platform, workflow and prompt configuration"
```
