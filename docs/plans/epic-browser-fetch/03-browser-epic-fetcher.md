# Task 3: BrowserEpicFetcher — composing the two, and every failure string

> Part of the [Epic Browser Fetch implementation plan](README.md).

Composes [Task 1](01-cdp-session.md)'s `BrowserLauncher` and [Task 2](02-jira-extractor.md)'s
extraction into the one call [Task 4](04-setup-view-wiring.md) actually makes. Owns the ticket
URL, and every message a developer can see — collected here rather than scattered across the
call sites, matching the table in
[Section 19](../../spec/19-epic-browser-fetch.md#failure-modes).

**Files:**
- Create: `src/browser/BrowserEpicFetcher.ts`
- Create: `test/browser/BrowserEpicFetcher.test.ts`

**Interfaces:**
- Consumes: `BrowserLauncher` (Task 1), `EXTRACT_SCRIPT` / `parseExtracted` (Task 2)
- Produces: `FetchResult`, `fetchEpic`, `JIRA_BASE_URL_NOT_SET`

---

- [ ] **Step 1: The result type and the fixed strings**

Create `src/browser/BrowserEpicFetcher.ts`:

```typescript
import type { BrowserLauncher } from './CdpSession'
import { BrowserNotFoundError } from './CdpSession'
import { EXTRACT_SCRIPT, parseExtracted, type EpicTicket } from './JiraExtractor'

export type FetchResult = { ok: true; ticket: EpicTicket } | { ok: false; message: string }

export const JIRA_BASE_URL_NOT_SET =
  'Set aiDevWorkflow.jiraBaseUrl in Settings → Extensions → AI Dev Workflow to use Fetch from browser.'

/** A Jira ticket redirects to its login page under this path when signed out. */
const LOGIN_PATH_HINT = '/login'
```

- [ ] **Step 2: The fetch itself**

```typescript
export async function fetchEpic(
  epicKey: string,
  jiraBaseUrl: string | undefined,
  launcher: BrowserLauncher,
): Promise<FetchResult> {
  const base = (jiraBaseUrl ?? '').trim()
  if (!base) return { ok: false, message: JIRA_BASE_URL_NOT_SET }

  const key = epicKey.trim()
  if (!key) return { ok: false, message: 'Enter an epic key before fetching.' }

  let target
  try {
    const session = await launcher.session()
    target = await session.openTarget()
  } catch (err) {
    if (err instanceof BrowserNotFoundError) return { ok: false, message: err.message }
    return { ok: false, message: `Could not reach a Chromium browser: ${String(err)}` }
  }

  try {
    const url = `${base.replace(/\/$/, '')}/browse/${key}`
    await target.navigate(url)

    const landedUrl = await target.extract<string>('location.href')
    if (landedUrl.includes(LOGIN_PATH_HINT)) {
      return {
        ok: false,
        message: 'Not signed in — a browser window has opened; sign in and press Fetch again.',
      }
    }

    const raw = await target.extract<unknown>(EXTRACT_SCRIPT)
    const ticket = parseExtracted(raw)
    if (!ticket.title) {
      return { ok: false, message: `No ticket found for "${key}".` }
    }
    return { ok: true, ticket }
  } catch (err) {
    return { ok: false, message: `Could not read the ticket: ${String(err)}` }
  } finally {
    await target.close()
  }
}
```

- [ ] **Step 3: Tests, against fakes for `BrowserLauncher`**

Create `test/browser/BrowserEpicFetcher.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { fetchEpic, JIRA_BASE_URL_NOT_SET } from '../../src/browser/BrowserEpicFetcher'
import { BrowserNotFoundError, type BrowserLauncher } from '../../src/browser/CdpSession'

function launcherReturning(landedUrl: string, extracted: unknown): BrowserLauncher {
  return {
    async session() {
      return {
        async openTarget() {
          return {
            async navigate() {},
            async extract(script: string) {
              return (script === 'location.href' ? landedUrl : extracted) as never
            },
            async close() {},
          }
        },
      }
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

  it('reports a browser that cannot be found', async () => {
    const result = await fetchEpic('PLAT-1', 'https://team.atlassian.net', launcherNotFound)
    expect(result.ok).toBe(false)
  })

  it('reports a login redirect distinctly from a missing ticket', async () => {
    const result = await fetchEpic(
      'PLAT-1',
      'https://team.atlassian.net',
      launcherReturning('https://team.atlassian.net/login', {}),
    )
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toContain('Not signed in')
  })

  it('reports a ticket that came back empty', async () => {
    const result = await fetchEpic(
      'PLAT-1',
      'https://team.atlassian.net',
      launcherReturning('https://team.atlassian.net/browse/PLAT-1', { title: '' }),
    )
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toContain('PLAT-1')
  })

  it('returns the ticket on success', async () => {
    const result = await fetchEpic(
      'PLAT-1',
      'https://team.atlassian.net',
      launcherReturning('https://team.atlassian.net/browse/PLAT-1', {
        title: 'Do the thing',
        description: 'Because reasons',
        acceptanceCriteria: 'Given/When/Then',
      }),
    )
    expect(result).toEqual({
      ok: true,
      ticket: { title: 'Do the thing', description: 'Because reasons', acceptanceCriteria: 'Given/When/Then' },
    })
  })
})
```

Run: `npx vitest run test/browser/BrowserEpicFetcher.test.ts`
Expected: PASS

- [ ] **Step 4: Run the full gate**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 5: Rebuild and commit**

```bash
npm run build
git add src/browser/BrowserEpicFetcher.ts test/browser/BrowserEpicFetcher.test.ts out/
git commit -m "feat(browser): compose the CDP session and the extractor into one fetch

Every failure a developer can see collected here: an unset setting, no
Chromium found, a login redirect, an empty ticket. Matches the table in
spec Section 19."
```
