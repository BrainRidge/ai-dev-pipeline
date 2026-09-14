# Task 2: JiraExtractor — reading a ticket

> Part of the [Epic Browser Fetch implementation plan](README.md).

Isolates the one piece of this feature that a Jira UI change breaks: the DOM selectors that
say where the title, description and acceptance criteria live on a ticket page. Everything in
[Task 1](01-cdp-session.md) stays correct even if Atlassian reshuffles their markup tomorrow;
only this file would need an update.

Independent of Task 1 — this operates on an HTML string, however it arrived — so the two can be
built and tested in either order. It runs inside the browser page via
`BrowserTarget.extract` (Task 1), not in Node against a fetched HTML string, because the ticket
page is a single-page app: the fields the extension needs do not exist in the initial HTML
response, only after the page's own JavaScript has rendered them.

**Files:**
- Create: `src/browser/JiraExtractor.ts`
- Create: `test/browser/JiraExtractor.test.ts`
- Create: `test/browser/fixtures/` — one or two saved ticket-page DOM snapshots

**Interfaces:**
- Produces: `EpicTicket`, `EXTRACT_SCRIPT`, `parseExtracted`

---

- [ ] **Step 1: The shape of a fetched ticket**

Create `src/browser/JiraExtractor.ts`:

```typescript
export interface EpicTicket {
  title: string
  description: string
  acceptanceCriteria: string
}
```

- [ ] **Step 2: The in-page script, kept as a string constant**

This runs inside the ticket page via `BrowserTarget.extract<EpicTicket>(EXTRACT_SCRIPT)`
(Task 1), so it cannot import anything — it is plain DOM code, stringified. Keeping it as one
named constant, rather than inline where it is called, is what makes "a Jira UI change is a
change to one file" true beyond just this file's boundary — Task 3 never touches these
selectors.

```typescript
/**
 * Selectors match Jira Cloud's issue view as of 2026. A future Jira UI change
 * means updating the selectors below, not the fetch pipeline that calls this.
 */
export const EXTRACT_SCRIPT = `(() => {
  const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? ''
  return {
    title: text('[data-testid="issue.views.issue-base.foundation.summary.heading"]'),
    description: text('[data-testid="issue.views.field.rich-text.description"]'),
    acceptanceCriteria: text('[data-testid="issue.views.field.rich-text"][aria-label*="Acceptance Criteria" i]'),
  }
})()`
```

- [ ] **Step 3: Defend against a shape the page did not actually return**

`Runtime.evaluate`'s `result.value` is whatever the script returned, untyped as far as the
caller is concerned — a Jira change that renames or removes a field should read as "empty
field", not throw somewhere unrelated:

```typescript
export function parseExtracted(value: unknown): EpicTicket {
  const v = (value ?? {}) as Partial<EpicTicket>
  return {
    title: typeof v.title === 'string' ? v.title : '',
    description: typeof v.description === 'string' ? v.description : '',
    acceptanceCriteria: typeof v.acceptanceCriteria === 'string' ? v.acceptanceCriteria : '',
  }
}
```

- [ ] **Step 4: Tests**

Create `test/browser/JiraExtractor.test.ts`. `EXTRACT_SCRIPT` itself runs inside a real page and
is exercised in [manual acceptance](../../MANUAL-ACCEPTANCE.md), not here; the unit tier tests
`parseExtracted` against the shapes a page realistically returns:

```typescript
import { describe, it, expect } from 'vitest'
import { parseExtracted } from '../../src/browser/JiraExtractor'

describe('parseExtracted', () => {
  it('passes through a well-formed result', () => {
    expect(parseExtracted({ title: 'T', description: 'D', acceptanceCriteria: 'AC' })).toEqual({
      title: 'T',
      description: 'D',
      acceptanceCriteria: 'AC',
    })
  })

  it('reads a missing field as empty rather than throwing', () => {
    expect(parseExtracted({ title: 'T' })).toEqual({ title: 'T', description: '', acceptanceCriteria: '' })
  })

  it('reads a wholly unexpected shape as all-empty', () => {
    expect(parseExtracted(null)).toEqual({ title: '', description: '', acceptanceCriteria: '' })
    expect(parseExtracted('unexpected')).toEqual({ title: '', description: '', acceptanceCriteria: '' })
  })
})
```

Run: `npx vitest run test/browser/JiraExtractor.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full gate**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 6: Rebuild and commit**

```bash
npm run build
git add src/browser/JiraExtractor.ts test/browser/JiraExtractor.test.ts out/
git commit -m "feat(browser): isolate Jira's ticket-page DOM knowledge

One file to update if Atlassian reshuffles their markup; everything
downstream sees EpicTicket regardless. See spec Section 19."
```
