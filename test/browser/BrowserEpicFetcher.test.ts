import { describe, it, expect } from 'vitest'
import { fetchEpic, JIRA_BASE_URL_NOT_SET } from '../../src/browser/BrowserEpicFetcher'
import { BrowserNotFoundError, type BrowserLauncher, type BrowserTarget } from '../../src/browser/CdpSession'

interface FakeTargetOptions {
  /** What `location.href` reads as until (and unless) `waitWhileUrlIncludes` changes it. */
  landedUrl: string
  extracted?: unknown
  /** What the tab's URL becomes after waiting — defaults to unchanged, i.e. a timeout. */
  afterWait?: string
  throwOnNavigate?: Error
}

/** Records which of a target's own methods were called, in order, with enough detail to assert on. */
function fakeTarget(opts: FakeTargetOptions): { target: BrowserTarget; calls: string[] } {
  const calls: string[] = []
  let currentUrl = opts.landedUrl
  return {
    calls,
    target: {
      async navigate(url) {
        calls.push(`navigate:${url}`)
        if (opts.throwOnNavigate) throw opts.throwOnNavigate
      },
      async extract(script: string) {
        return (script === 'location.href' ? currentUrl : opts.extracted) as never
      },
      async bringToFront() {
        calls.push('bringToFront')
      },
      async waitWhileUrlIncludes(needle, timeoutMs) {
        calls.push(`waitWhileUrlIncludes:${needle}:${timeoutMs}`)
        currentUrl = opts.afterWait ?? currentUrl
        return currentUrl
      },
      async close() {
        calls.push('close')
      },
    },
  }
}

function launcherFor(target: BrowserTarget): BrowserLauncher {
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
    const { target } = fakeTarget({ landedUrl: 'x' })
    const result = await fetchEpic('PLAT-1', undefined, launcherFor(target))
    expect(result).toEqual({ ok: false, message: JIRA_BASE_URL_NOT_SET })
  })

  it('refuses when jiraBaseUrl is only whitespace', async () => {
    const { target } = fakeTarget({ landedUrl: 'x' })
    const result = await fetchEpic('PLAT-1', '   ', launcherFor(target))
    expect(result).toEqual({ ok: false, message: JIRA_BASE_URL_NOT_SET })
  })

  it('refuses an empty epic key', async () => {
    const { target } = fakeTarget({ landedUrl: 'x' })
    const result = await fetchEpic('  ', 'https://team.atlassian.net', launcherFor(target))
    expect(result.ok).toBe(false)
  })

  it('reports a browser that cannot be found', async () => {
    const result = await fetchEpic('PLAT-1', 'https://team.atlassian.net', launcherNotFound)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toContain('Chrome')
  })

  describe('a login redirect', () => {
    // Closing it here left nothing for the developer to act on: the tab
    // showing the sign-in page was gone, and the window fell back to a blank
    // new tab. Found by testing against a real signed-out ticket.
    it('brings the sign-in tab forward without closing it, and waits on it', async () => {
      const { target, calls } = fakeTarget({
        landedUrl: 'https://team.atlassian.net/login',
        afterWait: 'https://team.atlassian.net/login', // times out — still signing in
      })
      await fetchEpic('PLAT-1', 'https://team.atlassian.net', launcherFor(target), {
        signInTimeoutMs: 1_000,
      })
      expect(calls).toContain('bringToFront')
      expect(calls).toContain('waitWhileUrlIncludes:/login:1000')
      expect(calls).not.toContain('close')
    })

    it('reports a timeout distinctly from a missing ticket, naming how long it waited', async () => {
      const { target } = fakeTarget({
        landedUrl: 'https://team.atlassian.net/login',
        afterWait: 'https://team.atlassian.net/login',
      })
      const result = await fetchEpic('PLAT-1', 'https://team.atlassian.net', launcherFor(target), {
        signInTimeoutMs: 60_000,
      })
      expect(result.ok).toBe(false)
      expect(result.ok === false && result.message).toContain('Still not signed in')
      expect(result.ok === false && result.message).toContain('1 minute')
    })

    // The whole point of waiting rather than failing immediately: signing in
    // inside the timeout resumes the same fetch with no second click.
    it('resumes automatically and returns the ticket when sign-in completes within the timeout', async () => {
      const { target, calls } = fakeTarget({
        landedUrl: 'https://team.atlassian.net/login',
        afterWait: 'https://team.atlassian.net/browse/PLAT-1',
        extracted: { title: 'Do the thing', description: '', acceptanceCriteria: '' },
      })
      const result = await fetchEpic('PLAT-1', 'https://team.atlassian.net', launcherFor(target))
      expect(result).toEqual({
        ok: true,
        ticket: { title: 'Do the thing', description: '', acceptanceCriteria: '' },
      })
      // Re-navigates to the ticket once signed in, rather than trusting
      // wherever Jira's own continue= redirect happened to land.
      expect(calls).toContain('navigate:https://team.atlassian.net/browse/PLAT-1')
      expect(calls).toContain('close')
    })
  })

  it('reports a ticket that came back empty, quoting the key, and closes the tab', async () => {
    const { target, calls } = fakeTarget({
      landedUrl: 'https://team.atlassian.net/browse/PLAT-1',
      extracted: { title: '' },
    })
    const result = await fetchEpic('PLAT-1', 'https://team.atlassian.net', launcherFor(target))
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toContain('PLAT-1')
    expect(calls).toContain('close')
  })

  it('returns the ticket on success, and closes the tab', async () => {
    const { target, calls } = fakeTarget({
      landedUrl: 'https://team.atlassian.net/browse/PLAT-1',
      extracted: {
        title: 'Do the thing',
        description: 'Because reasons',
        acceptanceCriteria: 'Given/When/Then',
      },
    })
    const result = await fetchEpic('PLAT-1', 'https://team.atlassian.net', launcherFor(target))
    expect(result).toEqual({
      ok: true,
      ticket: {
        title: 'Do the thing',
        description: 'Because reasons',
        acceptanceCriteria: 'Given/When/Then',
      },
    })
    expect(calls).toContain('close')
  })

  it('builds the ticket URL from jiraBaseUrl and the epic key, trimming a trailing slash', async () => {
    const { target, calls } = fakeTarget({
      landedUrl: 'https://team.atlassian.net/browse/PLAT-1',
      extracted: { title: 'T', description: '', acceptanceCriteria: '' },
    })
    await fetchEpic('PLAT-1', 'https://team.atlassian.net/', launcherFor(target))
    expect(calls).toEqual(['navigate:https://team.atlassian.net/browse/PLAT-1', 'close'])
  })

  it('closes the target even when the fetch fails outright', async () => {
    const { target, calls } = fakeTarget({
      landedUrl: 'https://team.atlassian.net/browse/PLAT-1',
      throwOnNavigate: new Error('boom'),
    })
    const result = await fetchEpic('PLAT-1', 'https://team.atlassian.net', launcherFor(target))
    expect(result.ok).toBe(false)
    expect(calls).toContain('close')
  })
})
