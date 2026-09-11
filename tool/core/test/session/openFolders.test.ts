import { describe, it, expect } from 'vitest'
import { allInsideOpenFolders } from '../../src/session/openFolders'

const OPEN = '/Users/tarun.kumar/Documents/workspace'

describe('allInsideOpenFolders', () => {
  it('is true when every repository sits under the open folder', () => {
    expect(
      allInsideOpenFolders(
        [`${OPEN}/party-service`, `${OPEN}/reference-data-service`],
        [OPEN],
      ),
    ).toBe(true)
  })

  it('is true for a repository nested deeper', () => {
    expect(allInsideOpenFolders([`${OPEN}/team/party-service`], [OPEN])).toBe(true)
  })

  it('is true when the repository is itself an open folder', () => {
    expect(allInsideOpenFolders([`${OPEN}/party-service`], [`${OPEN}/party-service`])).toBe(true)
  })

  it('spreads across several open folders', () => {
    expect(
      allInsideOpenFolders(
        ['/a/party-service', '/b/orders-service'],
        ['/a', '/b'],
      ),
    ).toBe(true)
  })

  it('is false when even one repository is outside', () => {
    expect(
      allInsideOpenFolders([`${OPEN}/party-service`, '/srv/other/orders'], [OPEN]),
    ).toBe(false)
  })

  it('is false when nothing is open, as in an empty window', () => {
    expect(allInsideOpenFolders([`${OPEN}/party-service`], [])).toBe(false)
  })

  it('is false when there are no repositories to judge', () => {
    expect(allInsideOpenFolders([], [OPEN])).toBe(false)
  })

  it('tolerates a trailing separator on the open folder', () => {
    expect(allInsideOpenFolders([`${OPEN}/party-service`], [`${OPEN}/`])).toBe(true)
  })

  // /Users/you/workspace-old must not count as inside /Users/you/workspace.
  it('does not treat a sibling with a shared prefix as inside', () => {
    expect(allInsideOpenFolders([`${OPEN}-old/party-service`], [OPEN])).toBe(false)
  })

  it('does not treat a parent as inside its child', () => {
    expect(allInsideOpenFolders([OPEN], [`${OPEN}/party-service`])).toBe(false)
  })
})
