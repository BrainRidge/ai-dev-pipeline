import { describe, it, expect } from 'vitest'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
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

  it('stamps every entry with an ISO timestamp', async () => {
    const log = new AuditLog(await mkdtemp(join(tmpdir(), 'au-')))
    await log.append({ kind: 'x' })
    expect((await log.entries())[0]!.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('preserves append order', async () => {
    const log = new AuditLog(await mkdtemp(join(tmpdir(), 'au-')))
    for (const k of ['a', 'b', 'c']) await log.append({ kind: k })
    expect((await log.entries()).map((e) => e.kind)).toEqual(['a', 'b', 'c'])
  })

  it('writes under .engine, not the task folder root', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'au-'))
    await new AuditLog(dir).append({ kind: 'x' })
    expect(await readdir(dir)).toEqual(['.engine'])
  })
})
