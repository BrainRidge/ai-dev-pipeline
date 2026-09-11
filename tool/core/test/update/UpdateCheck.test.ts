import { describe, it, expect } from 'vitest'
import { isNewer, checkForUpdate } from '../../src/update/UpdateCheck'

describe('isNewer', () => {
  it('compares semver numerically, not lexically', () => {
    expect(isNewer('0.9.0', '0.10.0')).toBe(true)
  })

  it('is false for identical versions', () => {
    expect(isNewer('1.2.3', '1.2.3')).toBe(false)
  })

  it('is false when the manifest is behind', () => {
    expect(isNewer('2.0.0', '1.9.9')).toBe(false)
  })

  it('handles patch-level differences', () => {
    expect(isNewer('1.0.0', '1.0.1')).toBe(true)
  })
})

describe('checkForUpdate', () => {
  it('is skipped when no manifest url is configured', async () => {
    expect(
      await checkForUpdate({
        manifestUrl: '',
        currentVersion: '1.0.0',
        fetchJson: async () => ({ version: '2.0.0' }),
      }),
    ).toBeUndefined()
  })

  it('returns the newer version when one exists', async () => {
    expect(
      await checkForUpdate({
        manifestUrl: 'https://x/m.json',
        currentVersion: '1.0.0',
        fetchJson: async () => ({ version: '1.1.0' }),
      }),
    ).toBe('1.1.0')
  })

  it('returns undefined when already current', async () => {
    expect(
      await checkForUpdate({
        manifestUrl: 'https://x/m.json',
        currentVersion: '1.1.0',
        fetchJson: async () => ({ version: '1.1.0' }),
      }),
    ).toBeUndefined()
  })

  it('stays silent when the manifest is unreachable', async () => {
    expect(
      await checkForUpdate({
        manifestUrl: 'https://x/m.json',
        currentVersion: '1.0.0',
        fetchJson: async () => {
          throw new Error('offline')
        },
      }),
    ).toBeUndefined()
  })
})
