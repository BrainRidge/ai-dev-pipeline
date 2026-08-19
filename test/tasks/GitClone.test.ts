import { describe, it, expect } from 'vitest'
import { GitClone } from '../../src/tasks/GitClone'
import type { CommandSink } from '../../src/tasks/CommandSink'
import { context, step } from '../support/fixtures'

const clone = step('gitClone', { stepType: 'commandExecution', taskType: 'gitClone' })

function sink() {
  const copied: string[] = []
  const staged: string[] = []
  const impl: CommandSink = {
    async copy(text) { copied.push(text) },
    async toTerminal(text) { staged.push(text) },
  }
  return { impl, copied, staged }
}

/** `cloned` lists the paths that already exist on disk. */
function task(cloned: string[] = [], s: CommandSink = sink().impl) {
  return new GitClone('/code', (p) => cloned.includes(p), s)
}

const WORK = '/Users/you/work'
const ctx = context({ inputs: { services: ['pis'], baseBranch: 'develop', workDir: WORK } })
const both = context({
  inputs: { services: ['pis', 'ords'], baseBranch: 'develop', workDir: WORK },
})

const lines = (blocks: { lines: string[] }[]) => blocks.flatMap((b) => b.lines)

describe('GitClone', () => {
  it('is a commandExecution step', () => {
    expect(task().stepType).toBe('commandExecution')
  })

  it('moves into the work directory, then clones with a short name', () => {
    expect(lines(task().plan(ctx))).toEqual([
      `mkdir -p ${WORK}`,
      `cd ${WORK}`,
      'git clone https://abc.github/payment-service.ui payment-service.ui',
      'cd payment-service.ui',
      'git checkout develop',
      'git pull',
    ])
  })

  it('names the folder after the repository, not the shortCode', () => {
    const lines = task().plan(ctx)[0]!.lines
    expect(lines.join('\n')).not.toMatch(/(^|[ /])pis($|[ /])/)
  })

  it('makes the work directory first, because cd into a missing one fails', () => {
    expect(lines(task().plan(ctx))[0]).toBe(`mkdir -p ${WORK}`)
  })

  it('plans a fetch instead when the repository is already cloned', () => {
    expect(lines(task([`${WORK}/payment-service.ui`]).plan(ctx))).toEqual([
      `cd ${WORK}/payment-service.ui`,
      'git fetch origin',
      'git checkout develop',
      'git pull',
    ])
  })

  it('re-plans per render, so cloning one by hand changes what is shown', () => {
    expect(task([]).plan(ctx)[0]!.lines[0]).toMatch(/^mkdir -p/)
    expect(task([`${WORK}/payment-service.ui`]).plan(ctx)[0]!.lines[0]).toBe(
      `cd ${WORK}/payment-service.ui`,
    )
  })

  it('follows the work directory chosen for this task', () => {
    const elsewhere = context({
      inputs: { services: ['pis'], baseBranch: 'develop', workDir: '/srv/repos' },
    })
    expect(lines(task().plan(elsewhere))).toContain('cd /srv/repos')
  })

  it('falls back to the configured root for a task started before work dirs existed', () => {
    const old = context({ inputs: { services: ['pis'], baseBranch: 'develop' } })
    expect(lines(task().plan(old))).toContain('cd /code')
  })

  it('checks out the base branch chosen in the sidebar, not the epic', () => {
    const other = context({
      inputs: { services: ['pis'], baseBranch: 'release/2026.08', workDir: WORK },
    })
    expect(lines(task().plan(other))).toContain('git checkout release/2026.08')
  })

  it('creates no branch, because the developer said to stop on the base', () => {
    expect(lines(task().plan(ctx)).join('\n')).not.toContain('checkout -b')
  })

  // The block id stays the shortCode: it is what the Copy buttons address.
  it('gives one block per microservice, each labelled and addressable', () => {
    const blocks = task().plan(both)
    expect(blocks.map((b) => b.id)).toEqual(['pis', 'ords'])
    expect(blocks.map((b) => b.label)).toEqual([
      'Payment Service (pis)',
      'Orders Service (ords)',
    ])
  })

  it('ignores a selected shortCode that is not in the catalogue', () => {
    const bogus = context({ inputs: { services: ['nope'], baseBranch: 'develop', workDir: WORK } })
    expect(task().plan(bogus)).toEqual([])
  })

  it('omits the checkout when no base branch was collected, rather than guessing one', () => {
    const bare = context({ inputs: { services: ['pis'], workDir: WORK } })
    expect(lines(task().plan(bare))).toEqual([
      `mkdir -p ${WORK}`,
      `cd ${WORK}`,
      'git clone https://abc.github/payment-service.ui payment-service.ui',
      'cd payment-service.ui',
    ])
  })

  it('names the work directory in the step text, so it is visible before running', async () => {
    expect((await task().describe(clone, ctx, {})).text).toContain(WORK)
  })

  it('offers the commands and a way to say they have been run', async () => {
    const view = await task().describe(clone, ctx, {})
    expect(view.commands).toHaveLength(1)
    expect(view.actions.map((a) => a.id)).toEqual(['back', 'submit'])
  })
})

describe('delivering the commands', () => {
  it('copies one block as pasteable text', async () => {
    const s = sink()
    const { text, label } = await task([], s.impl).deliver('pis', 'copy', ctx)
    expect(s.copied).toEqual([text])
    expect(label).toBe('Payment Service (pis)')
    expect(text.split('\n')).toHaveLength(6)
  })

  it('stages a block at the terminal prompt instead', async () => {
    const s = sink()
    await task([], s.impl).deliver('pis', 'terminal', ctx)
    expect(s.staged).toHaveLength(1)
    expect(s.copied).toEqual([])
  })

  it('joins every block for "all", separated by a blank line', async () => {
    const s = sink()
    const { text } = await task([], s.impl).deliver('all', 'copy', both)
    expect(text).toContain('git clone https://abc.github/payment-service.ui payment-service.ui')
    expect(text).toContain('git clone https://abc.github/orders-service orders-service')
    expect(text).toContain('\n\n')
  })

  it('labels the combined delivery for the progress message', async () => {
    const { label } = await task([], sink().impl).deliver('all', 'copy', both)
    expect(label).toBe('all 2 repositories')
  })

  it('rejects a block that is not in the plan', async () => {
    await expect(task().deliver('ghost', 'copy', ctx)).rejects.toThrow(/ghost/)
  })
})

describe('completing the step', async () => {
  it('advances on the developer’s word, since nothing is executed here', () => {
    expect(task().validate().ok).toBe(true)
  })

  it('records absolute repository paths, which the workspace file needs', async () => {
    const result = await task().execute(clone, both, {})
    expect(result.repos).toEqual([
      { name: 'payment-service.ui', path: `${WORK}/payment-service.ui` },
      { name: 'orders-service', path: `${WORK}/orders-service` },
    ])
    expect(result.branch).toBe('develop')
  })

  it('records the exact commands it showed, which is all the audit can prove', async () => {
    const result = await task().execute(clone, ctx, {})
    const shown = result.commands as { lines: string[] }[]
    expect(shown[0]!.lines[0]).toBe(`mkdir -p ${WORK}`)
  })
})
