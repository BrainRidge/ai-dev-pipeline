import { BrowserNotFoundError, type BrowserLauncher } from './CdpSession'
import { EXTRACT_SCRIPT, parseExtracted, type EpicTicket } from './JiraExtractor'

export type FetchResult = { ok: true; ticket: EpicTicket } | { ok: false; message: string }

export const JIRA_BASE_URL_NOT_SET =
  'Set aiDevWorkflow.jiraBaseUrl in Settings → Extensions → AI Dev Workflow to use Fetch from browser.'

/** A Jira ticket redirects to its login page under this path when signed out. */
const LOGIN_PATH_HINT = '/login'

/**
 * Composes `BrowserLauncher` (`CdpSession.ts`) and the extractor
 * (`JiraExtractor.ts`) into the one call the sidebar makes, and owns every
 * message a developer can see. See spec Section 19.
 */
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
