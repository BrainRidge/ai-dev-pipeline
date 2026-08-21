import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkflowCatalog } from '../../src/engine/WorkflowCatalog'

const WORKFLOWS = join(__dirname, '../../workflows')

/** Writes the given files to a temp dir and returns the two paths load() wants. */
async function configDir(
  files: Record<string, string>,
): Promise<{ dir: string; platformConfig: string; microserviceConfig: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'cfg-'))
  await mkdir(dir, { recursive: true })
  for (const [name, body] of Object.entries(files)) await writeFile(join(dir, name), body)
  return {
    dir,
    platformConfig: join(dir, 'platforms.json'),
    microserviceConfig: join(dir, 'microservices.json'),
  }
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
      `Microservice config not found at ${dir.microserviceConfig}`,
    )
  })

  it('names platforms.json when that is the one missing', async () => {
    const dir = await configDir({ 'microservices.json': '[]' })
    await expect(WorkflowCatalog.load(WORKFLOWS, dir)).rejects.toThrow(
      `Platform config not found at ${dir.platformConfig}`,
    )
  })

  it('attributes a schema failure to the file it came from', async () => {
    const dir = await configDir({
      'platforms.json': PLATFORMS,
      'microservices.json': JSON.stringify([{ shortCode: 'x' }]),
    })
    await expect(WorkflowCatalog.load(WORKFLOWS, dir)).rejects.toThrow(/Microservice config/)
  })

  it('reports malformed JSON against the file rather than as a bare syntax error', async () => {
    const dir = await configDir({ 'platforms.json': PLATFORMS, 'microservices.json': '[' })
    await expect(WorkflowCatalog.load(WORKFLOWS, dir)).rejects.toThrow(/Microservice config/)
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
