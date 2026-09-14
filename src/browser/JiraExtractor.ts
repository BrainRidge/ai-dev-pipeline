export interface EpicTicket {
  title: string
  description: string
  acceptanceCriteria: string
}

/**
 * Runs inside the ticket page via `BrowserTarget.extract<EpicTicket>(EXTRACT_SCRIPT)`
 * (`src/browser/CdpSession.ts`), so it cannot import anything — it is plain DOM
 * code, stringified. Kept as one named constant so a future Jira UI change is a
 * change to this file alone, not to the fetch pipeline that calls it.
 *
 * Selectors match Jira Cloud's issue view as of 2026. See spec Section 19.
 */
export const EXTRACT_SCRIPT = `(() => {
  const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? ''
  return {
    title: text('[data-testid="issue.views.issue-base.foundation.summary.heading"]'),
    description: text('[data-testid="issue.views.field.rich-text.description"]'),
    acceptanceCriteria: text('[data-testid="issue.views.field.rich-text"][aria-label*="Acceptance Criteria" i]'),
  }
})()`

/**
 * `Runtime.evaluate`'s result is whatever the page returned, untyped as far as
 * the caller is concerned. A Jira change that renames or removes a field
 * should read as an empty field, not throw somewhere unrelated to this file.
 */
export function parseExtracted(value: unknown): EpicTicket {
  const v = (value ?? {}) as Partial<EpicTicket>
  return {
    title: typeof v.title === 'string' ? v.title : '',
    description: typeof v.description === 'string' ? v.description : '',
    acceptanceCriteria: typeof v.acceptanceCriteria === 'string' ? v.acceptanceCriteria : '',
  }
}
