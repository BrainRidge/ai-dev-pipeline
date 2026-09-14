import { describe, it, expect } from 'vitest'
import {
  findBrowser,
  profileDir,
  BrowserNotFoundError,
  type ExecutableProbe,
} from '../../src/browser/CdpSession'

function probeOf(existing: string[]): ExecutableProbe {
  return {
    async firstExisting(candidates) {
      return candidates.find((c) => existing.includes(c))
    },
  }
}

describe('findBrowser', () => {
  it('prefers Chrome when both are installed', async () => {
    const probe = probeOf([
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ])
    expect(await findBrowser('darwin', probe)).toContain('Chrome')
  })

  it('falls back to Edge when Chrome is not installed', async () => {
    const probe = probeOf(['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'])
    expect(await findBrowser('darwin', probe)).toContain('Edge')
  })

  it('reports neither being found', async () => {
    await expect(findBrowser('darwin', probeOf([]))).rejects.toThrow(BrowserNotFoundError)
  })

  it('reports neither being found on a platform with no known candidates', async () => {
    await expect(findBrowser('sunos', probeOf([]))).rejects.toThrow(BrowserNotFoundError)
  })
})

describe('profileDir', () => {
  it('sits under the given storage directory, never inside a task folder', () => {
    expect(profileDir('/ext/globalStorage')).toBe('/ext/globalStorage/browser-fetch-profile')
  })
})
