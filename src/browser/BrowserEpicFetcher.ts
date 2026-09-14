import { BrowserNotFoundError, type BrowserLauncher } from './CdpSession'
import { EXTRACT_SCRIPT, parseExtracted, type EpicTicket } from './JiraExtractor'

export type FetchResult = { ok: true; ticket: EpicTicket } | { ok: false; message: string }

export const JIRA_BASE_URL_NOT_SET =
  'Set aiDevWorkflow.jiraBaseUrl in Settings → Extensions → AI Dev Workflow to use Fetch from browser.'

/** A Jira ticket redirects to its login page under this path when signed out. */
const LOGIN_PATH_HINT = '/login'

/** How long a fetch waits for a developer to sign in by hand before giving up. */
const DEFAULT_SIGN_IN_TIMEOUT_MS = 5 * 60_000

/**
 * Composes `BrowserLauncher` (`CdpSession.ts`) and the extractor
 * (`JiraExtractor.ts`) into the one call the sidebar makes, and owns every
 * message a developer can see. See spec Section 19.
 */
export async function fetchEpic(
  epicKey: string,
  jiraBaseUrl: string | undefined,
  launcher: BrowserLauncher,
  opts: { signInTimeoutMs?: number } = {},
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

    let landedUrl = await target.extract<string>('location.href')
    if (landedUrl.includes(LOGIN_PATH_HINT)) {
      // Deliberately not closed here: this is the tab to sign in on. Closing
      // it left nothing for the developer to act on — the window fell back
      // to a blank new tab, found by testing against a real signed-out
      // ticket, where "a browser window has opened" was true but there was
      // nothing left in it to sign into.
      await target.bringToFront()

      const timeoutMs = opts.signInTimeoutMs ?? DEFAULT_SIGN_IN_TIMEOUT_MS
      landedUrl = await target.waitWhileUrlIncludes(LOGIN_PATH_HINT, timeoutMs)

      if (landedUrl.includes(LOGIN_PATH_HINT)) {
        // Still on the login page after waiting — leave the tab open and
        // report it plainly rather than hanging the sidebar forever on a
        // sign-in that may never happen.
        const minutes = Math.round(timeoutMs / 60_000)
        return {
          ok: false,
          message: `Still not signed in after ${minutes} minute${minutes === 1 ? '' : 's'} — sign in on the browser tab, then press Fetch again.`,
        }
      }

      // Signed in. Jira's own continue= redirect normally lands back on the
      // ticket already; re-navigating is cheap and removes any doubt about
      // exactly where the tab ended up.
      await target.navigate(url)
    }

    const raw = await target.extract<unknown>(EXTRACT_SCRIPT)
    const ticket = parseExtracted(raw)
    if (!ticket.title) {
      await target.close()
      return { ok: false, message: `No ticket found for "${key}".` }
    }
    await target.close()
    return { ok: true, ticket }
  } catch (err) {
    await target.close().catch(() => {})
    return { ok: false, message: `Could not read the ticket: ${String(err)}` }
  }
}
