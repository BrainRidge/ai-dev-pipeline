import { describe, it, expect } from 'vitest'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PromptComposer } from '../../src/prompt/PromptComposer'
import { context, step } from '../support/fixtures'

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
  return new PromptComposer(dir)
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
