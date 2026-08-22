import { describe, it, expect } from 'vitest'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PromptComposer } from '../../src/prompt/PromptComposer'
import { nodeProbe, templateResolver } from '../../src/content/ContentRoot'
import { bundledResolver, context, step } from '../support/fixtures'

const TEMPLATE = `---
output: 02-analysis.md
---
Analysing for {{task.platform}}.
Story: {{requirement.story}}
Notes: {{requirement.notes}}
Services: {{task.services}}
`

/** Templates are found by convention at <workflowId>/<stepId>.md. */
async function composer(body = TEMPLATE): Promise<PromptComposer> {
  const dir = await mkdtemp(join(tmpdir(), 'pr-'))
  await mkdir(join(dir, 'researchTaskWorkflow'), { recursive: true })
  await writeFile(join(dir, 'researchTaskWorkflow', 'aiHandoff.md'), body)
  return new PromptComposer(bundledResolver(dir))
}

const answers: Record<string, Record<string, unknown>> = {
  requirement: { story: 'PLAT-1 body', notes: 'said in refinement' },
}

const ctx = context({
  inputs: { services: ['pis', 'ords'] },
  answersOf: (id) => answers[id] ?? {},
})

const handoff = step('aiHandoff', { stepType: 'aiHandoff', taskType: 'invokeCopilot' })
const repos = [{ name: 'pis', path: '/code/pis' }]

describe('PromptComposer', () => {
  it('finds the template by workflow and step, so a new workflow needs no code', async () => {
    expect((await (await composer()).compose(handoff, ctx, repos)).prompt).toContain(
      'Analysing for canada-assisted.',
    )
  })

  it('resolves step and task placeholders', async () => {
    const { prompt } = await (await composer()).compose(handoff, ctx, repos)
    expect(prompt).toContain('Story: PLAT-1 body')
    expect(prompt).toContain('Notes: said in refinement')
  })

  it('joins array answers readably', async () => {
    const { prompt } = await (await composer()).compose(handoff, ctx, repos)
    expect(prompt).toContain('Services: pis, ords')
  })

  it('keeps the frontmatter out of the prompt', async () => {
    const { prompt } = await (await composer()).compose(handoff, ctx, repos)
    expect(prompt).not.toContain('output: 02-analysis.md')
    expect(prompt.startsWith('Analysing for')).toBe(true)
  })

  it('takes the output contract from the template, not from code', async () => {
    expect(await (await composer()).outputFor(handoff, ctx)).toBe('02-analysis.md')
  })

  it('appends the four parts in order', async () => {
    const { prompt } = await (await composer()).compose(handoff, ctx, repos)
    const iTemplate = prompt.indexOf('Analysing for')
    const iPaths = prompt.indexOf('/code/pis')
    const iScope = prompt.indexOf('Work only within')
    const iOutput = prompt.indexOf('02-analysis.md')
    expect(iTemplate).toBeLessThan(iPaths)
    expect(iPaths).toBeLessThan(iScope)
    expect(iScope).toBeLessThan(iOutput)
  })

  it('emits #file references for each repo', async () => {
    const { prompt } = await (await composer()).compose(handoff, ctx, repos)
    expect(prompt).toContain('#file:/code/pis')
  })

  it('states the absolute output path', async () => {
    const { prompt } = await (await composer()).compose(handoff, ctx, repos)
    expect(prompt).toContain('/tasks/T-1/02-analysis.md')
  })

  it('renders a missing answer as empty rather than "undefined"', async () => {
    const bare = context({ answersOf: () => ({}) })
    const { prompt } = await (await composer()).compose(handoff, bare, repos)
    expect(prompt).not.toContain('undefined')
  })

  it('is deterministic', async () => {
    const c = await composer()
    const first = await c.compose(handoff, ctx, repos)
    expect((await c.compose(handoff, ctx, repos)).prompt).toBe(first.prompt)
  })

  it('rejects an output key that is present but unusable', async () => {
    const c = await composer('---\noutput: "  "\n---\nBody.\n')
    await expect(c.compose(handoff, ctx, repos)).rejects.toThrow(/unusable/)
  })
})

/**
 * A handoff that edits code produces no document, so its template declares no
 * output and the prompt carries no file contract to invent one.
 */
describe('a template with no output declared', async () => {
  it('composes without frontmatter at all', async () => {
    const { prompt } = await (await composer('Just do it for {{task.epic}}.\n')).compose(
      handoff,
      ctx,
      repos,
    )
    expect(prompt).toContain('Just do it for PLAT-1234.')
  })

  it('reports no output file', async () => {
    const c = await composer('Just do it.\n')
    expect((await c.compose(handoff, ctx, repos)).outputFile).toBeUndefined()
  })

  it('instructs the model to change code in place instead', async () => {
    const { prompt } = await (await composer('Just do it.\n')).compose(handoff, ctx, repos)
    expect(prompt).toContain('Change the code in place')
    expect(prompt).not.toContain('Create the file if it does not exist')
  })

  it('still constrains the scope, which is the part that must not be optional', async () => {
    const { prompt } = await (await composer('Just do it.\n')).compose(handoff, ctx, repos)
    expect(prompt).toContain('Work only within')
    expect(prompt).toContain('#file:/code/pis')
  })

  it('refuses to answer outputFor, because a watched step needs a filename', async () => {
    const c = await composer('Just do it.\n')
    await expect(c.outputFor(handoff, ctx)).rejects.toThrow(/must declare "output:"/)
  })
})

/**
 * A bundled directory and a team directory, so resolution has something to
 * choose between. Returns both paths so tests can assert which one won.
 */
async function twoSources(opts: { external?: string }): Promise<{
  composer: PromptComposer
  bundledDir: string
  contentRoot: string
}> {
  const bundledDir = await mkdtemp(join(tmpdir(), 'bundled-'))
  await mkdir(join(bundledDir, 'researchTaskWorkflow'), { recursive: true })
  await writeFile(join(bundledDir, 'researchTaskWorkflow', 'aiHandoff.md'), TEMPLATE)

  const contentRoot = await mkdtemp(join(tmpdir(), 'team-'))
  if (opts.external !== undefined) {
    await mkdir(join(contentRoot, 'prompts', 'researchTaskWorkflow'), { recursive: true })
    await writeFile(
      join(contentRoot, 'prompts', 'researchTaskWorkflow', 'aiHandoff.md'),
      opts.external,
    )
  }

  return {
    composer: new PromptComposer(
      templateResolver({ promptsDir: join(contentRoot, 'prompts'), bundledPromptsDir: bundledDir }, nodeProbe),
    ),
    bundledDir,
    contentRoot,
  }
}

describe('where the template came from', () => {
  it('reports the bundled template when the team supplied none', async () => {
    const { composer, bundledDir } = await twoSources({})
    const composed = await composer.compose(handoff, ctx, repos)
    expect(composed.templateSource).toBe('bundled')
    expect(composed.templatePath).toBe(join(bundledDir, 'researchTaskWorkflow', 'aiHandoff.md'))
  })

  it("uses and reports the team's template when they supplied one", async () => {
    const { composer, contentRoot } = await twoSources({
      external: '---\noutput: 02-analysis.md\n---\nOur own wording for {{task.epic}}.\n',
    })
    const composed = await composer.compose(handoff, ctx, repos)
    expect(composed.templateSource).toBe('external')
    expect(composed.templatePath).toBe(
      join(contentRoot, 'prompts', 'researchTaskWorkflow', 'aiHandoff.md'),
    )
    expect(composed.prompt).toContain('Our own wording for PLAT-1234.')
  })

  it('takes the output contract from whichever template won', async () => {
    const { composer } = await twoSources({ external: '---\noutput: our-analysis.md\n---\nBody.\n' })
    expect(await composer.outputFor(handoff, ctx)).toBe('our-analysis.md')
  })

  it('answers resolved() without composing, for callers that only need the path', async () => {
    const { composer, contentRoot } = await twoSources({ external: 'Body.\n' })
    expect(await composer.resolved(handoff, ctx)).toEqual({
      path: join(contentRoot, 'prompts', 'researchTaskWorkflow', 'aiHandoff.md'),
      source: 'external',
    })
  })

  // The guard from Task 0, seen from where a developer would actually hit it.
  it('surfaces a case-mismatched override as a composition failure', async () => {
    const bundledDir = await mkdtemp(join(tmpdir(), 'bundled-'))
    await mkdir(join(bundledDir, 'researchTaskWorkflow'), { recursive: true })
    await writeFile(join(bundledDir, 'researchTaskWorkflow', 'aiHandoff.md'), TEMPLATE)

    const contentRoot = await mkdtemp(join(tmpdir(), 'team-'))
    await mkdir(join(contentRoot, 'prompts', 'researchTaskWorkflow'), { recursive: true })
    await writeFile(join(contentRoot, 'prompts', 'researchTaskWorkflow', 'aiHandoff.MD'), 'Body.\n')

    const composer = new PromptComposer(
      templateResolver({ promptsDir: join(contentRoot, 'prompts'), bundledPromptsDir: bundledDir }, nodeProbe),
    )
    await expect(composer.compose(handoff, ctx, repos)).rejects.toThrow(
      /found "aiHandoff\.MD".*expected "aiHandoff\.md"/,
    )
  })
})

/**
 * A handoff may pull in more than one markdown file: `include:` quotes them
 * into the prompt, `reference:` names them for Copilot to open itself. Both are
 * declared in the template's own frontmatter, for the reason spec Section 8
 * gives for `output:` living there. See spec Section 8.
 */
describe('a template that pulls in other files', () => {
  /** A prompts root holding a step template plus whatever else is asked for. */
  async function tree(files: Record<string, string>): Promise<PromptComposer> {
    const dir = await mkdtemp(join(tmpdir(), 'inc-'))
    for (const [rel, body] of Object.entries(files)) {
      const path = join(dir, rel)
      await mkdir(join(path, '..'), { recursive: true })
      await writeFile(path, body)
    }
    return new PromptComposer(bundledResolver(dir))
  }

  const MAIN = `---
output: 02-analysis.md
include:
  - _shared/house-rules.md
  - _shared/java.md
---
The step's own thinking.
`

  it('quotes each included file, in the order declared', async () => {
    const c = await tree({
      'researchTaskWorkflow/aiHandoff.md': MAIN,
      '_shared/house-rules.md': 'RULES',
      '_shared/java.md': 'JAVA',
    })
    const { prompt } = await c.compose(handoff, ctx, repos)
    expect(prompt.indexOf('RULES')).toBeGreaterThan(prompt.indexOf("step's own thinking"))
    expect(prompt.indexOf('JAVA')).toBeGreaterThan(prompt.indexOf('RULES'))
  })

  it('keeps the generated parts after everything authored', async () => {
    const c = await tree({
      'researchTaskWorkflow/aiHandoff.md': MAIN,
      '_shared/house-rules.md': 'RULES',
      '_shared/java.md': 'JAVA',
    })
    const { prompt } = await c.compose(handoff, ctx, repos)
    expect(prompt.indexOf('## Repositories in scope')).toBeGreaterThan(prompt.indexOf('JAVA'))
  })

  it('resolves placeholders inside an included file too', async () => {
    const c = await tree({
      'researchTaskWorkflow/aiHandoff.md': `---\ninclude: _shared/x.md\n---\nBody.`,
      '_shared/x.md': 'Working on {{task.platform}} for {{task.epic}}.',
    })
    const { prompt } = await c.compose(handoff, ctx, repos)
    expect(prompt).toContain('Working on canada-assisted for PLAT-1234.')
    expect(prompt).not.toContain('{{')
  })

  // One file is the common case, and making it a list would be ceremony.
  it('accepts a single name where a list would do', async () => {
    const c = await tree({
      'researchTaskWorkflow/aiHandoff.md': `---\ninclude: _shared/x.md\n---\nBody.`,
      '_shared/x.md': 'ONE',
    })
    expect((await c.compose(handoff, ctx, repos)).prompt).toContain('ONE')
  })

  it('records each included file and whose it was, for the caption and the log', async () => {
    const c = await tree({
      'researchTaskWorkflow/aiHandoff.md': `---\ninclude: _shared/x.md\n---\nBody.`,
      '_shared/x.md': 'ONE',
    })
    const { includes } = await c.compose(handoff, ctx, repos)
    expect(includes).toEqual([
      { path: expect.stringContaining('_shared/x.md'), source: 'bundled' },
    ])
  })

  // Fatal, unlike a missing reference: its text is part of what is being asked,
  // and dropping it would change the prompt while the caption still claimed it.
  it('fails when an included file is not there, naming both files', async () => {
    const c = await tree({
      'researchTaskWorkflow/aiHandoff.md': `---\ninclude: _shared/gone.md\n---\nBody.`,
    })
    await expect(c.compose(handoff, ctx, repos)).rejects.toThrow(
      /includes "_shared\/gone\.md", which was not found at/,
    )
  })

  // One level only, so there are no cycles to detect.
  it('refuses an included file that declares include: of its own', async () => {
    const c = await tree({
      'researchTaskWorkflow/aiHandoff.md': `---\ninclude: _shared/a.md\n---\nBody.`,
      '_shared/a.md': `---\ninclude: _shared/b.md\n---\nA`,
      '_shared/b.md': 'B',
    })
    await expect(c.compose(handoff, ctx, repos)).rejects.toThrow(
      /declares "include:", which only a step's own template may do/,
    )
  })

  it('refuses an included file that declares an output artifact', async () => {
    const c = await tree({
      'researchTaskWorkflow/aiHandoff.md': `---\ninclude: _shared/a.md\n---\nBody.`,
      '_shared/a.md': `---\noutput: other.md\n---\nA`,
    })
    await expect(c.compose(handoff, ctx, repos)).rejects.toThrow(/declares "output:"/)
  })

  it('strips an included file’s frontmatter rather than quoting it', async () => {
    const c = await tree({
      'researchTaskWorkflow/aiHandoff.md': `---\ninclude: _shared/a.md\n---\nBody.`,
      '_shared/a.md': `---\ntitle: unrelated key\n---\nVISIBLE`,
    })
    const { prompt } = await c.compose(handoff, ctx, repos)
    expect(prompt).toContain('VISIBLE')
    expect(prompt).not.toContain('unrelated key')
  })

  // Every quoted file has to be either the team's or the bundled default, or
  // the caption and the audit entry stop meaning anything.
  it('refuses an absolute path', async () => {
    const c = await tree({
      'researchTaskWorkflow/aiHandoff.md': `---\ninclude: /etc/passwd\n---\nBody.`,
    })
    await expect(c.compose(handoff, ctx, repos)).rejects.toThrow(
      /Use a path relative to the prompts folder/,
    )
  })

  it('refuses a path that climbs out of the prompts folder', async () => {
    const c = await tree({
      'researchTaskWorkflow/aiHandoff.md': `---\ninclude: ../../secrets.md\n---\nBody.`,
    })
    await expect(c.compose(handoff, ctx, repos)).rejects.toThrow(
      /Use a path relative to the prompts folder/,
    )
  })

  it('refuses an entry that is not a usable name', async () => {
    const c = await tree({
      'researchTaskWorkflow/aiHandoff.md': `---\ninclude:\n  - ""\n---\nBody.`,
    })
    await expect(c.compose(handoff, ctx, repos)).rejects.toThrow(
      /unusable entry under "include:"/,
    )
  })
})

describe('files a template points Copilot at', () => {
  async function tree(files: Record<string, string>): Promise<PromptComposer> {
    const dir = await mkdtemp(join(tmpdir(), 'ref-'))
    for (const [rel, body] of Object.entries(files)) {
      const path = join(dir, rel)
      await mkdir(join(path, '..'), { recursive: true })
      await writeFile(path, body)
    }
    return new PromptComposer(bundledResolver(dir))
  }

  it('emits a further-reading section of #file: lines', async () => {
    const c = await tree({
      'researchTaskWorkflow/aiHandoff.md': `---\nreference: _shared/api.md\n---\nBody.`,
      '_shared/api.md': 'API',
    })
    const { prompt } = await c.compose(handoff, ctx, repos)
    expect(prompt).toMatch(/## Further reading/)
    expect(prompt).toMatch(/- #file:.*_shared\/api\.md/)
  })

  it('does not quote what it references', async () => {
    const c = await tree({
      'researchTaskWorkflow/aiHandoff.md': `---\nreference: _shared/api.md\n---\nBody.`,
      '_shared/api.md': 'SECRET SAUCE',
    })
    expect((await c.compose(handoff, ctx, repos)).prompt).not.toContain('SECRET SAUCE')
  })

  it('omits the section entirely when nothing is referenced', async () => {
    const c = await tree({ 'researchTaskWorkflow/aiHandoff.md': 'Body.' })
    expect((await c.compose(handoff, ctx, repos)).prompt).not.toContain('Further reading')
  })

  it('reads before the output contract, which is the last thing asked', async () => {
    const c = await tree({
      'researchTaskWorkflow/aiHandoff.md': `---\noutput: a.md\nreference: _shared/api.md\n---\nBody.`,
      '_shared/api.md': 'API',
    })
    const { prompt } = await c.compose(handoff, ctx, repos)
    expect(prompt.indexOf('## Required output')).toBeGreaterThan(
      prompt.indexOf('## Further reading'),
    )
  })

  // The point of references: a document inside a repository the task has just
  // cloned, named through the same placeholders everything else uses.
  it('resolves a placeholder into an absolute path and uses it as it stands', async () => {
    const c = await tree({
      'researchTaskWorkflow/aiHandoff.md':
        `---\nreference: "{{task.dir}}/notes.md"\n---\nBody.`,
    })
    const { references, prompt } = await c.compose(handoff, ctx, repos)
    expect(references).toEqual([{ path: '/tasks/T-1/notes.md', found: false }])
    expect(prompt).toContain('#file:/tasks/T-1/notes.md')
  })

  // Emitted either way: what is sent must be what the panel shows, and the
  // caption is where the developer is told it is missing.
  it('still emits a reference that is not on disk, and says so in the result', async () => {
    const c = await tree({
      'researchTaskWorkflow/aiHandoff.md': `---\nreference: _shared/gone.md\n---\nBody.`,
    })
    const { references, prompt } = await c.compose(handoff, ctx, repos)
    expect(references[0]!.found).toBe(false)
    expect(prompt).toContain('#file:')
  })

  it('marks a reference that is there as found', async () => {
    const c = await tree({
      'researchTaskWorkflow/aiHandoff.md': `---\nreference: _shared/api.md\n---\nBody.`,
      '_shared/api.md': 'API',
    })
    expect((await c.compose(handoff, ctx, repos)).references[0]!.found).toBe(true)
  })

  it('drops an entry whose placeholders all resolve to nothing', async () => {
    const c = await tree({
      'researchTaskWorkflow/aiHandoff.md': `---\nreference: "{{task.nothing}}"\n---\nBody.`,
    })
    expect((await c.compose(handoff, ctx, repos)).references).toEqual([])
  })
})

describe('a placeholder that names nothing', () => {
  async function withBody(body: string): Promise<PromptComposer> {
    const dir = await mkdtemp(join(tmpdir(), 'unres-'))
    await mkdir(join(dir, 'researchTaskWorkflow'), { recursive: true })
    await writeFile(join(dir, 'researchTaskWorkflow', 'aiHandoff.md'), body)
    return new PromptComposer(bundledResolver(dir))
  }

  const seen = context({
    inputs: { services: ['pis'] },
    order: ['requirement', 'aiHandoff'],
    answersOf: (id) => (id === 'requirement' ? { story: 'why', notes: '' } : {}),
  })

  it('is reported rather than swallowed', async () => {
    const c = await withBody('Story: {{requirement.stroy}}')
    expect((await c.compose(handoff, seen, repos)).unresolved).toEqual(['requirement.stroy'])
  })

  it('leaves the prompt otherwise intact, so the developer can still send it', async () => {
    const c = await withBody('Story: {{requirement.stroy}} and {{requirement.story}}')
    const { prompt } = await c.compose(handoff, seen, repos)
    expect(prompt).toContain('and why')
    expect(prompt).not.toContain('{{')
  })

  it('says nothing for a template that resolves cleanly', async () => {
    const c = await withBody('Story: {{requirement.story}}')
    expect((await c.compose(handoff, seen, repos)).unresolved).toEqual([])
  })

  // A shared file is the worst place for a silent typo: it is wrong in every
  // workflow that includes it, and no single template looks broken.
  it('checks included files too', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'unres-inc-'))
    await mkdir(join(dir, 'researchTaskWorkflow'), { recursive: true })
    await mkdir(join(dir, '_shared'), { recursive: true })
    await writeFile(
      join(dir, 'researchTaskWorkflow', 'aiHandoff.md'),
      `---\ninclude: _shared/rules.md\n---\nClean: {{requirement.story}}`,
    )
    await writeFile(join(dir, '_shared', 'rules.md'), 'Broken: {{task.nonsense}}')

    const c = new PromptComposer(bundledResolver(dir))
    expect((await c.compose(handoff, seen, repos)).unresolved).toEqual(['task.nonsense'])
  })
})
