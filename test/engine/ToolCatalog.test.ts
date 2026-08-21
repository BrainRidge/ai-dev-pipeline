import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_TOOLS,
  loadTools,
  meetsMinimum,
  validateTools,
  versionIn,
} from '../../src/engine/ToolCatalog'
import type { ToolDef } from '../../src/engine/schema'

async function fileWith(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'tools-'))
  const path = join(dir, 'tools.json')
  await writeFile(path, content, 'utf8')
  return path
}

const GIT: ToolDef = {
  id: 'git',
  label: 'Git',
  command: 'git',
  args: ['--version'],
  required: true,
  why: '',
  install: {},
}

describe('reading a version out of what a tool prints', () => {
  it('reads git', () => {
    expect(versionIn('git version 2.50.1')).toBe('2.50.1')
  })

  it('reads a JDK, which quotes its version and adds a build date', () => {
    expect(versionIn('openjdk version "21.0.8" 2025-07-15')).toBe('21.0.8')
  })

  it('reads an old JDK, whose 1.x scheme still compares correctly', () => {
    expect(versionIn('java version "1.8.0_392"')).toBe('1.8.0')
  })

  it('reads Maven', () => {
    expect(versionIn('Apache Maven 3.9.6')).toBe('3.9.6')
  })

  it('gives nothing back for output with no number in it', () => {
    expect(versionIn('command not found')).toBeUndefined()
  })
})

describe('comparing a version against a floor', () => {
  it('accepts what is newer', () => {
    expect(meetsMinimum('21.0.8', '17')).toBe(true)
  })

  it('accepts what is exactly the floor, with the segments unequal in length', () => {
    expect(meetsMinimum('17', '17.0')).toBe(true)
  })

  it('rejects what is older', () => {
    expect(meetsMinimum('1.8.0', '17')).toBe(false)
  })

  it('compares numerically rather than as text, so 10 beats 9', () => {
    expect(meetsMinimum('2.10.0', '2.9.0')).toBe(true)
  })

  it('rejects a patch below the floor', () => {
    expect(meetsMinimum('2.29.9', '2.30')).toBe(false)
  })
})

describe('the bundled default tool list', () => {
  it('obeys its own schema, since it is parsed through it at import', () => {
    expect(DEFAULT_TOOLS.length).toBeGreaterThan(0)
  })

  it('requires git, because the Get the code step is git commands', () => {
    const git = DEFAULT_TOOLS.find((t) => t.id === 'git')!
    expect(git.required).toBe(true)
  })

  it('leaves the build tools optional, since a repository picks one of them', () => {
    for (const id of ['maven', 'gradle']) {
      expect(DEFAULT_TOOLS.find((t) => t.id === id)!.required).toBe(false)
    }
  })

  it('gives every tool an install hint for each platform a developer might use', () => {
    for (const tool of DEFAULT_TOOLS) {
      for (const platform of ['darwin', 'win32', 'linux']) {
        expect(tool.install[platform]).toBeTruthy()
      }
    }
  })

  it('says why each tool is wanted, which is what the report shows', () => {
    for (const tool of DEFAULT_TOOLS) expect(tool.why.length).toBeGreaterThan(20)
  })
})

describe('loading a team tool list', () => {
  it('reads a file and fills the optional fields in', async () => {
    const path = await fileWith('[{"id":"git","label":"Git","command":"git"}]')
    const tools = await loadTools(path)
    expect(tools).toEqual([
      { id: 'git', label: 'Git', command: 'git', args: ['--version'], required: true, why: '', install: {} },
    ])
  })

  // Absence is the ordinary path: it means fall back to the bundled default,
  // the same per-file fallback prompt templates get.
  it('gives nothing back when the file is not there, rather than failing', async () => {
    expect(await loadTools('/nowhere/at/all/tools.json')).toBeUndefined()
  })

  it('names the file when the JSON is malformed', async () => {
    const path = await fileWith('[{')
    await expect(loadTools(path)).rejects.toThrow(new RegExp(`Tool config at ${path} is not valid JSON`))
  })

  it('names the file when the shape is wrong', async () => {
    const path = await fileWith('[{"label":"No id","command":"x"}]')
    await expect(loadTools(path)).rejects.toThrow(/is not valid/)
  })

  it('refuses a minVersion that is not a version', async () => {
    const path = await fileWith('[{"id":"a","label":"A","command":"a","minVersion":"seventeen"}]')
    await expect(loadTools(path)).rejects.toThrow(/dotted numbers/)
  })

  it('refuses two tools sharing an id, which would drop one from the report', async () => {
    const path = await fileWith(
      '[{"id":"git","label":"Git","command":"git"},{"id":"git","label":"Git 2","command":"git2"}]',
    )
    await expect(loadTools(path)).rejects.toThrow(/share the id "git"/)
  })
})

describe('validateTools', () => {
  it('accepts distinct ids', () => {
    expect(() => validateTools([GIT, { ...GIT, id: 'java', label: 'Java' }])).not.toThrow()
  })

  it('names both tools in a clash, so the error says what to edit', () => {
    expect(() => validateTools([GIT, { ...GIT, label: 'Git again' }])).toThrow(
      /"Git again" and "Git" share the id "git"/,
    )
  })
})
