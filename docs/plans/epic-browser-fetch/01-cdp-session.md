# Task 1: CdpSession — reaching a signed-in Chromium browser

> Part of the [Epic Browser Fetch implementation plan](README.md).

The hard technical fact this task encodes: Chrome and Edge both ignore a
`--remote-debugging-port` flag on a second launch against a profile that is already running —
the existing window is just focused. So there is no reliable way to attach to whichever window
the developer already has open. Instead, this module owns a **dedicated automation profile**,
launched with the debug port from its first use, kept under the extension's own storage
directory and reused for the life of the installation. The first fetch shows the organisation's
SSO prompt once, in that profile's window; every fetch after that is silent. See
[Section 19](../../spec/19-epic-browser-fetch.md#reaching-a-signed-in-session-without-touching-the-developers-daily-browser).

Pure-ish: it does spawn a subprocess and open a socket, but every one of those is reached
through a small injected interface, so the actual decision logic — which browser to look for,
what to do when neither is found, how to build the launch arguments — is unit-tested without a
real browser, the same way `ContentRoot.ts` is tested without a real disk.

**Files:**
- Create: `src/browser/CdpSession.ts`
- Create: `test/browser/CdpSession.test.ts`

**Interfaces:**
- Produces: `BrowserTarget`, `BrowserLauncher`, `BrowserNotFoundError`, `findBrowser`,
  `chromiumLauncher`, `profileDir`

---

- [ ] **Step 1: The types, and what "finding a browser" means**

Create `src/browser/CdpSession.ts`:

```typescript
import { join } from 'node:path'

/** A single browser tab, opened for one fetch and closed afterwards. */
export interface BrowserTarget {
  navigate(url: string): Promise<void>
  /** Waits for the page to settle, then evaluates `script` in it and returns the result. */
  extract<T>(script: string): Promise<T>
  close(): Promise<void>
}

/** An attached, running browser. Opening a target does not focus its window. */
export interface BrowserSession {
  openTarget(): Promise<BrowserTarget>
}

/** Finds (or starts) the dedicated automation profile and attaches to it over CDP. */
export interface BrowserLauncher {
  session(): Promise<BrowserSession>
}

export class BrowserNotFoundError extends Error {
  constructor() {
    super('Neither Chrome nor Edge was found on this machine.')
  }
}

/** Where the dedicated profile lives — never inside a task's own folder. */
export function profileDir(globalStorageDir: string): string {
  return join(globalStorageDir, 'browser-fetch-profile')
}
```

- [ ] **Step 2: Locating an installed browser, injected so it is testable**

Still in `src/browser/CdpSession.ts`:

```typescript
/** One executable to try, per platform. Real paths are supplied by `nodeExecutableProbe`. */
export interface ExecutableProbe {
  /** The first of these paths that exists, or undefined if none do. */
  firstExisting(candidates: string[]): Promise<string | undefined>
}

const CHROME_CANDIDATES: Record<NodeJS.Platform, string[]> = {
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  win32: ['%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium-browser'],
} as unknown as Record<NodeJS.Platform, string[]>

const EDGE_CANDIDATES: Record<NodeJS.Platform, string[]> = {
  darwin: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  win32: ['%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe'],
  linux: ['/usr/bin/microsoft-edge'],
} as unknown as Record<NodeJS.Platform, string[]>

/** Chrome first, then Edge, on whichever platform this is running on. */
export async function findBrowser(
  platform: NodeJS.Platform,
  probe: ExecutableProbe,
): Promise<string> {
  const chrome = await probe.firstExisting(CHROME_CANDIDATES[platform] ?? [])
  if (chrome) return chrome
  const edge = await probe.firstExisting(EDGE_CANDIDATES[platform] ?? [])
  if (edge) return edge
  throw new BrowserNotFoundError()
}
```

- [ ] **Step 3: Tests for location and profile path — no subprocess, no network yet**

Create `test/browser/CdpSession.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { findBrowser, profileDir, BrowserNotFoundError, type ExecutableProbe } from '../../src/browser/CdpSession'

function probeOf(existing: string[]): ExecutableProbe {
  return { async firstExisting(candidates) { return candidates.find((c) => existing.includes(c)) } }
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

  it('reports neither being found, naming both', async () => {
    await expect(findBrowser('darwin', probeOf([]))).rejects.toThrow(BrowserNotFoundError)
  })
})

describe('profileDir', () => {
  it('sits under the given storage directory, never inside a task folder', () => {
    expect(profileDir('/ext/globalStorage')).toBe('/ext/globalStorage/browser-fetch-profile')
  })
})
```

Run: `npx vitest run test/browser/CdpSession.test.ts`
Expected: PASS

- [ ] **Step 4: Launching, attaching, and one background tab**

This is the one piece that genuinely talks to a subprocess and a socket, so it is kept as thin
as possible and is exercised for real only in
[manual acceptance](../../MANUAL-ACCEPTANCE.md), never in the unit tier:

```typescript
import { spawn } from 'node:child_process'
import CDP from 'chrome-remote-interface'

const DEBUG_PORT = 9222

/**
 * Attaches to the dedicated profile's browser if it is already running on the
 * debug port, otherwise launches it there. Either way, subsequent fetches in
 * the same VS Code session reuse the same running process.
 */
export function chromiumLauncher(executable: string, userDataDir: string): BrowserLauncher {
  let launched = false

  async function ensureRunning(): Promise<void> {
    try {
      await CDP.Version({ port: DEBUG_PORT })
      return
    } catch {
      // Not reachable yet — either never launched, or still starting.
    }
    if (!launched) {
      spawn(
        executable,
        [
          `--remote-debugging-port=${DEBUG_PORT}`,
          `--user-data-dir=${userDataDir}`,
          '--no-first-run',
        ],
        { detached: true, stdio: 'ignore' },
      ).unref()
      launched = true
    }
    await waitForPort(DEBUG_PORT)
  }

  return {
    async session() {
      await ensureRunning()
      return {
        async openTarget() {
          const client = await CDP({ port: DEBUG_PORT })
          const { Page, Runtime } = client
          await Page.enable()
          return {
            async navigate(url) {
              await Page.navigate({ url })
              await Page.loadEventFired()
            },
            async extract(script) {
              const { result } = await Runtime.evaluate({ expression: script, returnByValue: true })
              return result.value
            },
            async close() {
              await client.close()
            },
          }
        },
      }
    },
  }
}

async function waitForPort(port: number, timeoutMs = 15_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      await CDP.Version({ port })
      return
    } catch {
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  throw new Error(`Chromium did not open its debug port within ${timeoutMs}ms`)
}
```

Note for the implementer: `CDP({ port }).close()` here closes the *tab* (target), matching
`chrome-remote-interface`'s per-target client — confirm against the installed version's API
before wiring this into Task 3, since this is the one piece of this task not covered by a unit
test.

- [ ] **Step 5: Run the full gate**

Run: `npm run verify`
Expected: PASS

- [ ] **Step 6: Rebuild and commit**

```bash
npm run build
git add src/browser/CdpSession.ts test/browser/CdpSession.test.ts out/
git commit -m "feat(browser): locate a Chromium browser and attach over CDP

Dedicated automation profile, not the developer's daily browser —
launching a second process against an already-running profile silently
ignores the debug-port flag, so there is no zero-setup way to attach to
a window already open. See spec Section 19."
```
