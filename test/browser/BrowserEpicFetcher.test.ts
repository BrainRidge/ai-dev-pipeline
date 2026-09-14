import { describe, it, expect } from 'vitest'
import { fetchEpic, JIRA_BASE_URL_NOT_SET } from '../../src/browser/BrowserEpicFetcher'
import { BrowserNotFoundError, type BrowserLauncher, type BrowserTarget } from '../../src/browser/CdpSession'

/** Records which of a target's own methods were called, in order. */
function trackingTarget(landedUrl: string, extracted: unknown): { target: BrowserTarget; calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    target: {
      async navigate() {},
      async extract(script: string) {
        return (script === 'location.href' ? landedUrl : extracted) as never
      },
      async bringToFront() {
        calls.push('bringToFront')
      },
      async close() {
        calls.push('close')
      },
    },
  }
}

/** A launcher whose target reports `landedUrl` for `location.href` and `extracted` for anything else. */
function launcherReturning(landedUrl: string, extracted: unknown): BrowserLauncher {
  const { target } = trackingTarget(landedUrl, extracted)
  return {
    async session() {
      return { async openTarget() { return target } }
    },
  }
}

const launcherNotFound: BrowserLauncher = {
  async session() {
    throw new BrowserNotFoundError()
  },
}

describe('fetchEpic', () => {
  it('refuses when jiraBaseUrl is unset, naming the setting', async () => {
    const result = await fetchEpic('PLAT-1', undefined, launcherReturning('x', {}))
    expect(result).toEqual({ ok: false, message: JIRA_BASE_URL_NOT_SET })
  })

  it('refuses when jiraBaseUrl is only whitespace', async () => {
    const result = await fetchEpic('PLAT-1', '   ', launcherReturning('x', {}))
    expect(result).toEqual({ ok: false, message: JIRA_BASE_URL_NOT_SET })
  })

  it('refuses an empty epic key', async () => {
    const result = await fetchEpic('  ', 'https://team.atlassian.net', launcherReturning('x', {}))
    expect(result.ok).toBe(false)
  })

  it('reports a browser that cannot be found', async () => {
    const result = await fetchEpic('PLAT-1', 'https://team.atlassian.net', launcherNotFound)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toContain('Chrome')
  })

  describe('a login redirect', () => {
    it('is reported distinctly from a missing ticket', async () => {
      const result = await fetchEpic(
        'PLAT-1',
        'https://team.atlassian.net',
        launcherReturning('https://team.atlassian.net/login', {}),
      )
      expect(result.ok).toBe(false)
      expect(result.ok === false && result.message).toContain('Not signed in')
    })

    // Closing it here left nothing for the developer to act on: the tab
    // showing the sign-in page was gone, and the window fell back to a blank
    // new tab. Found by testing against a real signed-out ticket.
    it('leaves the tab open rather than closing it, and brings it forward', async () => {
      const { target, calls } = trackingTarget('https://team.atlassian.net/login', {})
      const launcher: BrowserLauncher = {
        async session() {
          return { async openTarget() { return target } }
        },
      }
      await fetchEpic('PLAT-1', 'https://team.atlassian.net', launcher)
      expect(calls).toEqual(['bringToFront'])
    })
  })

  it('reports a ticket that came back empty, quoting the key, and closes the tab', async () => {
    const { target, calls } = trackingTarget('https://team.atlassian.net/browse/PLAT-1', { title: '' })
    const launcher: BrowserLauncher = {
      async session() {
        return { async openTarget() { return target } }
      },
    }
    const result = await fetchEpic('PLAT-1', 'https://team.atlassian.net', launcher)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toContain('PLAT-1')
    expect(calls).toEqual(['close'])
  })

  it('returns the ticket on success, and closes the tab', async () => {
    const { target, calls } = trackingTarget('https://team.atlassian.net/browse/PLAT-1', {
      title: 'Do the thing',
      description: 'Because reasons',
      acceptanceCriteria: 'Given/When/Then',
    })
    const launcher: BrowserLauncher = {
      async session() {
        return { async openTarget() { return target } }
      },
    }
    const result = await fetchEpic('PLAT-1', 'https://team.atlassian.net', launcher)
    expect(result).toEqual({
      ok: true,
      ticket: {
        title: 'Do the thing',
        description: 'Because reasons',
        acceptanceCriteria: 'Given/When/Then',
      },
    })
    expect(calls).toEqual(['close'])
  })

  it('builds the ticket URL from jiraBaseUrl and the epic key, trimming a trailing slash', async () => {
    const seenUrls: string[] = []
    const launcher: BrowserLauncher = {
      async session() {
        return {
          async openTarget() {
            return {
              async navigate(url) {
                seenUrls.push(url)
              },
              async extract(script: string) {
                return (script === 'location.href'
                  ? 'https://team.atlassian.net/browse/PLAT-1'
                  : { title: 'T', description: '', acceptanceCriteria: '' }) as never
              },
              async bringToFront() {},
              async close() {},
            }
          },
        }
      },
    }
    await fetchEpic('PLAT-1', 'https://team.atlassian.net/', launcher)
    expect(seenUrls).toEqual(['https://team.atlassian.net/browse/PLAT-1'])
  })

  it('closes the target even when the fetch fails outright', async () => {
    const closed: boolean[] = []
    const launcher: BrowserLauncher = {
      async session() {
        return {
          async openTarget() {
            return {
              async navigate() {
                throw new Error('boom')
              },
              async extract() {
                return undefined as never
              },
              async bringToFront() {},
              async close() {
                closed.push(true)
              },
            }
          },
        }
      },
    }
    const result = await fetchEpic('PLAT-1', 'https://team.atlassian.net', launcher)
    expect(result.ok).toBe(false)
    expect(closed).toEqual([true])
  })
})
