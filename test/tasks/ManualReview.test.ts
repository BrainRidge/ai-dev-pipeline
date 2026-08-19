import { describe, it, expect } from 'vitest'
import { ManualReview } from '../../src/tasks/ManualReview'
import { context, step } from '../support/fixtures'

const review = step('reviewAnalysis', { stepType: 'manual', taskType: 'manualReview' })

/** A run where the handoff step has already written its artifact. */
const ctx = context({
  order: ['requirement', 'gitClone', 'aiHandoff', 'reviewAnalysis'],
  resultOf: (id) => (id === 'aiHandoff' ? { outputPath: '/tasks/T-1/02-analysis.md' } : {}),
})

describe('ManualReview', () => {
  it('is a manual step', () => {
    expect(new ManualReview(async () => {}, async () => 'h').stepType).toBe('manual')
  })

  it('reviews whatever the nearest earlier step produced', () => {
    const s = new ManualReview(async () => {}, async () => 'h')
    expect(s.artifactPath(review, ctx)).toBe('/tasks/T-1/02-analysis.md')
  })

  it('opens that artifact in an editor', async () => {
    const opened: string[] = []
    const s = new ManualReview(async (p) => { opened.push(p) }, async () => 'h')
    await s.open(review, ctx)
    expect(opened).toEqual(['/tasks/T-1/02-analysis.md'])
  })

  it('names the artifact so the developer knows which tab to read', async () => {
    const s = new ManualReview(async () => {}, async () => 'h')
    expect((await s.describe(review, ctx, {})).text).toContain('02-analysis.md')
  })

  it('offers Revise and Approve, in that order', async () => {
    const s = new ManualReview(async () => {}, async () => 'h')
    expect((await s.describe(review, ctx, {})).actions.map((a) => a.id)).toEqual(['revise', 'approve'])
  })

  it('records the artifact hash on approval', async () => {
    const s = new ManualReview(async () => {}, async () => 'deadbeef')
    expect(await s.execute(review, ctx, {})).toEqual({
      artifactPath: '/tasks/T-1/02-analysis.md',
      artifactHash: 'deadbeef',
      approved: true,
    })
  })

  it('ignores results produced after it, so a revise loop reviews the right file', () => {
    const later = context({
      order: ['reviewAnalysis', 'aiHandoff'],
      resultOf: (id) => (id === 'aiHandoff' ? { outputPath: '/tasks/T-1/late.md' } : {}),
    })
    expect(new ManualReview(async () => {}, async () => 'h').artifactPath(review, later)).toBeUndefined()
  })

  it('says so plainly when nothing has been produced yet', async () => {
    const empty = context({ order: ['reviewAnalysis'] })
    const s = new ManualReview(
      async () => { throw new Error('should not open') },
      async () => { throw new Error('should not hash') },
    )
    expect((await s.describe(review, empty, {})).text).toContain('No earlier step')
    await s.open(review, empty)
    expect(await s.execute(review, empty, {})).toEqual({ approved: true })
  })
})
