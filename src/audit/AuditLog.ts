import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface AuditEntry {
  at?: string
  kind: string
  stepId?: string
  data?: Record<string, unknown>
}

/**
 * Append-only. Entries are written BEFORE the action they describe, so a
 * crashed step still leaves a record. See spec Section 5.
 */
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
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as AuditEntry & { at: string })
  }
}
