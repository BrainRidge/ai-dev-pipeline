# Task 6: Audit log

> Part of the [Phase 1 implementation plan](README.md). Completed and shipped.

**Files:**
- Create: `src/audit/AuditLog.ts`
- Test: `test/audit/AuditLog.test.ts`

**Interfaces:**
- Produces: `new AuditLog(taskDir: string)`, `log.append(entry: AuditEntry): Promise<void>`, `log.entries(): Promise<AuditEntry[]>`
- Produces: `interface AuditEntry { at: string; kind: string; stepId?: string; data?: Record<string, unknown> }`

- [ ] **Step 1: Write the failing test**

```typescript
// test/audit/AuditLog.test.ts
import { describe, it, expect } from 'vitest'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AuditLog } from '../../src/audit/AuditLog'

describe('AuditLog', () => {
  it('appends one JSON object per line', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'au-'))
    const log = new AuditLog(dir)
    await log.append({ kind: 'step-entered', stepId: 'scope' })
    await log.append({ kind: 'prompt-composed', stepId: 'analyse', data: { chars: 42 } })

    const raw = await readFile(join(dir, '.engine', 'audit.jsonl'), 'utf8')
    const lines = raw.trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[1]!).data.chars).toBe(42)
  })

  it('stamps every entry with a timestamp', async () => {
    const log = new AuditLog(await mkdtemp(join(tmpdir(), 'au-')))
    await log.append({ kind: 'x' })
    expect((await log.entries())[0]!.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/audit/AuditLog.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/audit/AuditLog.ts`**

```typescript
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface AuditEntry {
  at?: string
  kind: string
  stepId?: string
  data?: Record<string, unknown>
}

/** Append-only. Entries are written BEFORE the action they describe, so a
 *  crashed step still leaves a record. See spec Section 5. */
export class AuditLog {
  private readonly engineDir: string
  private readonly file: string

  constructor(taskDir: string) {
    this.engineDir = join(taskDir, '.engine')
    this.file = join(this.engineDir, 'audit.jsonl')
  }

  async append(entry: AuditEntry): Promise<void> {
    await mkdir(this.engineDir, { recursive: true })
    const stamped = { at: new Date().toISOString(), ...entry }
    await appendFile(this.file, `${JSON.stringify(stamped)}\n`, 'utf8')
  }

  async entries(): Promise<(AuditEntry & { at: string })[]> {
    const raw = await readFile(this.file, 'utf8')
    return raw.trim().split('\n').filter(Boolean)
      .map(l => JSON.parse(l) as AuditEntry & { at: string })
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/audit/AuditLog.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: append-only audit log"
```
