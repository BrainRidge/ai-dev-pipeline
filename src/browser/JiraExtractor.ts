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
  // An empty rich-text field renders as an "Add <Field>, edit" button holding
  // placeholder text ("Add a description...") rather than being absent — so
  // a naive textContent read returns that placeholder as if it were real
  // content. Found by testing against a real ticket with no description.
  // Jira's read view for a field that actually has content does not carry
  // this "Add …" button, so its presence is the signal an empty field
  // leaves behind.
  const richText = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return ''
    if (el.querySelector('button[aria-label^="Add "]')) return ''
    return el.textContent?.trim() ?? ''
  }
  return {
    title: text('[data-testid="issue.views.issue-base.foundation.summary.heading"]'),
    description: richText('[data-testid="issue.views.field.rich-text.description"]'),
    acceptanceCriteria: richText('[data-testid="issue.views.field.rich-text"][aria-label*="Acceptance Criteria" i]'),
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
