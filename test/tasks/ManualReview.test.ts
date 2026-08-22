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
    expect(new ManualReview(async () => {}, async () => 'h', async () => {}).stepType).toBe('manual')
  })

  it('reviews whatever the nearest earlier step produced', () => {
    const s = new ManualReview(async () => {}, async () => 'h', async () => {})
    expect(s.artifactPath(review, ctx)).toBe('/tasks/T-1/02-analysis.md')
  })

  it('opens that artifact in an editor', async () => {
    const opened: string[] = []
    const s = new ManualReview(async (p) => { opened.push(p) }, async () => 'h', async () => {})
    await s.open(review, ctx)
    expect(opened).toEqual(['/tasks/T-1/02-analysis.md'])
  })

  it('names the artifact so the developer knows which tab to read', async () => {
    const s = new ManualReview(async () => {}, async () => 'h', async () => {})
    expect((await s.describe(review, ctx, {})).text).toContain('02-analysis.md')
  })

  it('offers Revise and Approve, in that order', async () => {
    const s = new ManualReview(async () => {}, async () => 'h', async () => {})
    expect((await s.describe(review, ctx, {})).actions.map((a) => a.id)).toEqual(['revise', 'approve'])
  })

  it('records the artifact hash on approval', async () => {
    const s = new ManualReview(async () => {}, async () => 'deadbeef', async () => {})
    expect(await s.execute(review, ctx, {})).toEqual({
      artifactPath: '/tasks/T-1/02-analysis.md',
      artifactHash: 'deadbeef',
      approvedCopy: '/tasks/T-1/.engine/approved/reviewAnalysis-02-analysis.md',
      approved: true,
    })
  })

  it('ignores results produced after it, so a revise loop reviews the right file', () => {
    const later = context({
      order: ['reviewAnalysis', 'aiHandoff'],
      resultOf: (id) => (id === 'aiHandoff' ? { outputPath: '/tasks/T-1/late.md' } : {}),
    })
    expect(new ManualReview(async () => {}, async () => 'h', async () => {}).artifactPath(review, later)).toBeUndefined()
  })

  it('says so plainly when nothing has been produced yet', async () => {
    const empty = context({ order: ['reviewAnalysis'] })
    const s = new ManualReview(
      async () => { throw new Error('should not open') },
      async () => { throw new Error('should not hash') },
      async () => { throw new Error('should not copy') },
    )
    expect((await s.describe(review, empty, {})).text).toContain('No earlier step')
    await s.open(review, empty)
    expect(await s.execute(review, empty, {})).toEqual({ approved: true })
  })
})

/**
 * Spec Section 8 recorded this as an open gap: only the hash was stored, so the
 * trail could prove the artifact had changed since approval and nothing about
 * what it had said. The artifact sits at the root of the task folder, which the
 * developer is invited to edit, so that was a likely rather than a theoretical
 * loss.
 */
describe('approval keeps a copy, not just a hash', () => {
  function spy() {
    const calls: { from: string; to: string }[] = []
    const task = new ManualReview(
      async () => {},
      async () => 'deadbeef',
      async (from, to) => {
        calls.push({ from, to })
      },
    )
    return { task, calls }
  }

  it('copies the approved file', async () => {
    const { task, calls } = spy()
    await task.execute(review, ctx, {})
    expect(calls).toEqual([
      {
        from: '/tasks/T-1/02-analysis.md',
        to: '/tasks/T-1/.engine/approved/reviewAnalysis-02-analysis.md',
      },
    ])
  })

  // Under .engine/, away from the files the developer is invited to open, for
  // the same reason the run state lives there. See spec Section 7.
  it('keeps it away from the artifacts the developer edits', async () => {
    const { task } = spy()
    const result = await task.execute(review, ctx, {})
    expect(String(result.approvedCopy)).toContain('/.engine/approved/')
  })

  // A second pass through the same review is a second approval of a different
  // file. Naming the copy after the step keeps both, since a record that can be
  // overwritten is not one.
  it('names the copy after the step that approved it', async () => {
    const { task } = spy()
    const result = await task.execute(review, ctx, {})
    expect(String(result.approvedCopy)).toContain('reviewAnalysis-02-analysis.md')
  })

  it('still approves when the copy cannot be written', async () => {
    const task = new ManualReview(
      async () => {},
      async () => 'deadbeef',
      async () => {
        throw new Error('read-only volume')
      },
    )

    const result = await task.execute(review, ctx, {})
    expect(result.approved).toBe(true)
    expect(result.artifactHash).toBe('deadbeef')
    // Recorded as absent rather than claimed, so the log does not promise a
    // copy that is not there.
    expect(result.approvedCopy).toBeNull()
  })

  it('copies nothing when no earlier step produced an artifact', async () => {
    const { task, calls } = spy()
    await task.execute(review, context({ order: ['reviewAnalysis'] }), {})
    expect(calls).toEqual([])
  })
})
