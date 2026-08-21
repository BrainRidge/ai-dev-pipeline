import { describe, it, expect } from 'vitest'
import {
  derivedFrom,
  externalWorkflowsPresent,
  fieldsToWrite,
  resolveAll,
  resolveConfigFile,
  resolvePromptsDir,
  templateNote,
  templateResolver,
  type ContentSettings,
  type DirectoryProbe,
  type Piece,
} from '../../src/content/ContentRoot'

function settings(over: Partial<ContentSettings> = {}): ContentSettings {
  return {
    contentRoot: '',
    microserviceConfig: '',
    platformConfig: '',
    customPrompts: '',
    toolsConfig: '',
    ...over,
  }
}

describe('what a content root derives', () => {
  it('places each piece where the template puts it', () => {
    expect(derivedFrom('/team')).toEqual({
      microserviceConfig: '/team/config/microservices.json',
      platformConfig: '/team/config/platforms.json',
      customPrompts: '/team/prompts',
      toolsConfig: '/team/config/tools.json',
    })
  })
})

describe('resolving a required config file', () => {
  it('names its own setting, and the root that would fill it in', () => {
    const r = resolveConfigFile('microserviceConfig', settings())
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.message).toBe(
      'No microservice config configured. Set aiDevWorkflow.microserviceConfig in ' +
        'Settings → Extensions → AI Dev Workflow, or set Content Root to fill it in.',
    )
  })

  it('names the platform setting when that is the missing one', () => {
    const r = resolveConfigFile('platformConfig', settings())
    expect(r.ok === false && r.message).toContain('aiDevWorkflow.platformConfig')
  })

  it('derives from the content root when the piece has no setting of its own', () => {
    expect(resolveConfigFile('microserviceConfig', settings({ contentRoot: '/team' }))).toEqual({
      ok: true,
      path: '/team/config/microservices.json',
    })
  })

  // Reading never depends on the derived value having been written into
  // settings, so hand-editing settings.json works and a failed write costs
  // nothing.
  it("prefers the piece's own setting over the content root", () => {
    const s = settings({ contentRoot: '/team', microserviceConfig: '/shared/services.json' })
    expect(resolveConfigFile('microserviceConfig', s)).toEqual({
      ok: true,
      path: '/shared/services.json',
    })
  })

  it('rejects a relative path in the piece, quoting what was given', () => {
    const r = resolveConfigFile('microserviceConfig', settings({ microserviceConfig: './s.json' }))
    expect(r.ok === false && r.message).toBe(
      'aiDevWorkflow.microserviceConfig must be an absolute path. Got "./s.json".',
    )
  })

  it('blames the content root when that is the relative one', () => {
    const r = resolveConfigFile('platformConfig', settings({ contentRoot: './team' }))
    expect(r.ok === false && r.message).toBe(
      'aiDevWorkflow.contentRoot must be an absolute path. Got "./team".',
    )
  })

  it('trims whitespace a pasted path carries', () => {
    expect(resolveConfigFile('platformConfig', settings({ platformConfig: '  /a/p.json ' }))).toEqual(
      { ok: true, path: '/a/p.json' },
    )
  })
})

/**
 * Prompts fall back per file to the bundled ones, so "not configured" is an
 * ordinary outcome rather than an error. "Configured badly" still is.
 */
describe('resolving the prompts folder', () => {
  it('reports none when neither it nor a content root is set', () => {
    expect(resolvePromptsDir(settings())).toEqual({ kind: 'none' })
  })

  it('derives from the content root', () => {
    expect(resolvePromptsDir(settings({ contentRoot: '/team' }))).toEqual({
      kind: 'dir',
      path: '/team/prompts',
    })
  })

  it('prefers its own setting, which is how a team shares one prompts repo', () => {
    const s = settings({ contentRoot: '/team', customPrompts: '/shared/prompts' })
    expect(resolvePromptsDir(s)).toEqual({ kind: 'dir', path: '/shared/prompts' })
  })

  it('reports a relative path rather than quietly using the bundled prompts', () => {
    const r = resolvePromptsDir(settings({ customPrompts: 'prompts' }))
    expect(r.kind).toBe('error')
    expect(r.kind === 'error' && r.message).toContain('aiDevWorkflow.customPrompts')
  })
})

/**
 * Setting the content root writes the four derived paths into settings. The
 * rule that makes that safe is that it only ever overwrites its own work.
 */
describe('deciding which fields to write', () => {
  const derived = derivedFrom('/team')
  const empty: Record<Piece, string> = {
    microserviceConfig: '',
    platformConfig: '',
    customPrompts: '',
    toolsConfig: '',
  }

  it('fills in every empty field', () => {
    expect(fieldsToWrite(empty, derived, {})).toEqual(derived)
  })

  it('updates a field that still holds what it last wrote', () => {
    const previous = derivedFrom('/old')
    const written = fieldsToWrite({ ...empty, customPrompts: previous.customPrompts }, derived, {
      customPrompts: previous.customPrompts,
    })
    expect(written.customPrompts).toBe('/team/prompts')
  })

  // The whole point of the rule: a hand-picked prompts folder must not silently
  // revert the next time the content root changes.
  it('leaves a field the developer chose themselves alone', () => {
    const written = fieldsToWrite(
      { ...empty, customPrompts: '/shared/prompts' },
      derived,
      { customPrompts: '/old/prompts' },
    )
    expect(written.customPrompts).toBeUndefined()
    expect(written.microserviceConfig).toBe('/team/config/microservices.json')
  })

  it('writes nothing when everything already holds the derived value', () => {
    expect(fieldsToWrite({ ...derived }, derived, derived)).toEqual({})
  })

  it('treats a whitespace-only field as empty', () => {
    expect(fieldsToWrite({ ...empty, platformConfig: '   ' }, derived, {}).platformConfig).toBe(
      '/team/config/platforms.json',
    )
  })
})

/** A disk that exists only in this test: directory path -> filenames. */
function probeOf(dirs: Record<string, string[]>): DirectoryProbe {
  return { async list(dir) { return dirs[dir] } }
}

const BUNDLED = '/ext/prompts'
const PROMPTS = '/team/prompts'

describe('resolving a prompt template', () => {
  it('uses the bundled template when no prompts folder is configured', async () => {
    const resolve = templateResolver({ bundledPromptsDir: BUNDLED }, probeOf({}))
    expect(await resolve('researchTaskWorkflow', 'aiHandoff')).toEqual({
      path: '/ext/prompts/researchTaskWorkflow/aiHandoff.md',
      source: 'bundled',
    })
  })

  it('uses the bundled template when the team has no folder for that workflow', async () => {
    const resolve = templateResolver({ promptsDir: PROMPTS, bundledPromptsDir: BUNDLED }, probeOf({}))
    expect((await resolve('researchTaskWorkflow', 'aiHandoff')).source).toBe('bundled')
  })

  // Per file, not per directory: overriding one prompt must not mean adopting
  // every other one and letting them go stale. See spec Section 16.
  it('falls back per file when the folder exists but that template does not', async () => {
    const resolve = templateResolver(
      { promptsDir: PROMPTS, bundledPromptsDir: BUNDLED },
      probeOf({ '/team/prompts/newFeatureWorkflow': ['CodeReview.md'] }),
    )
    expect(await resolve('newFeatureWorkflow', 'aiHandoff')).toEqual({
      path: '/ext/prompts/newFeatureWorkflow/aiHandoff.md',
      source: 'bundled',
    })
  })

  it("uses the team's template when they have supplied one", async () => {
    const resolve = templateResolver(
      { promptsDir: PROMPTS, bundledPromptsDir: BUNDLED },
      probeOf({ '/team/prompts/researchTaskWorkflow': ['aiHandoff.md'] }),
    )
    expect(await resolve('researchTaskWorkflow', 'aiHandoff')).toEqual({
      path: '/team/prompts/researchTaskWorkflow/aiHandoff.md',
      source: 'external',
    })
  })

  /**
   * The one mistake silent fallback must not hide. On a case-insensitive
   * filesystem this resolves and the team's prompt runs; on a case-sensitive
   * one it does not, and they would get the bundled prompt while believing
   * otherwise. See spec Section 16.
   */
  it('refuses a template that differs only by case, naming both names', async () => {
    const resolve = templateResolver(
      { promptsDir: PROMPTS, bundledPromptsDir: BUNDLED },
      probeOf({ '/team/prompts/researchTaskWorkflow': ['aiHandoff.MD'] }),
    )
    await expect(resolve('researchTaskWorkflow', 'aiHandoff')).rejects.toThrow(
      'found "aiHandoff.MD" in /team/prompts/researchTaskWorkflow, expected "aiHandoff.md"',
    )
  })

  it('prefers an exact match over a case variant sitting beside it', async () => {
    const resolve = templateResolver(
      { promptsDir: PROMPTS, bundledPromptsDir: BUNDLED },
      probeOf({ '/team/prompts/researchTaskWorkflow': ['aiHandoff.MD', 'aiHandoff.md'] }),
    )
    expect((await resolve('researchTaskWorkflow', 'aiHandoff')).source).toBe('external')
  })
})

describe('externalWorkflowsPresent', () => {
  // Workflows stay bundled. A team may reasonably expect otherwise, so their
  // folder is reported rather than ignored in silence. See spec Section 16.
  it('is true when the team has put a workflows folder in their content root', async () => {
    expect(
      await externalWorkflowsPresent('/team', probeOf({ '/team/workflows': ['mine_1_0.json'] })),
    ).toBe(true)
  })

  it('is false when they have not', async () => {
    expect(await externalWorkflowsPresent('/team', probeOf({}))).toBe(false)
  })

  it('is true even for an empty folder, because the intent is the signal', async () => {
    expect(await externalWorkflowsPresent('/team', probeOf({ '/team/workflows': [] }))).toBe(true)
  })
})

describe('templateNote', () => {
  it('marks a team template as external', () => {
    expect(templateNote({ path: '/team/prompts/w/s.md', source: 'external' })).toBe(
      'Template: /team/prompts/w/s.md (external)',
    )
  })

  it('says plainly when the bundled default was used', () => {
    expect(templateNote({ path: '/ext/prompts/w/s.md', source: 'bundled' })).toBe(
      'Template: /ext/prompts/w/s.md (bundled default)',
    )
  })
})

describe('resolveAll', () => {
  it('reports every path once all three are usable', () => {
    expect(resolveAll(settings({ contentRoot: '/team' }))).toEqual({
      ok: true,
      microserviceConfig: '/team/config/microservices.json',
      platformConfig: '/team/config/platforms.json',
      promptsDir: '/team/prompts',
      toolsConfig: '/team/config/tools.json',
    })
  })

  it('leaves promptsDir undefined when the team supplied none', () => {
    const r = resolveAll(
      settings({ microserviceConfig: '/a/m.json', platformConfig: '/a/p.json' }),
    )
    expect(r.ok === true && r.promptsDir).toBeUndefined()
  })

  it('reports the microservice config first, since it is the one that names repos', () => {
    const r = resolveAll(settings())
    expect(r.ok === false && r.message).toContain('aiDevWorkflow.microserviceConfig')
  })

  // Carrying on with the bundled prompts is the silent fallback this design
  // exists to avoid.
  it('stops for a broken prompts setting too, rather than using the bundled ones', () => {
    const r = resolveAll(settings({ contentRoot: '/team', customPrompts: 'relative' }))
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.message).toContain('aiDevWorkflow.customPrompts')
  })
})
