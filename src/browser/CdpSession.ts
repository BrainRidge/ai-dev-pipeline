import { spawn } from 'node:child_process'
import { join } from 'node:path'
// chrome-remote-interface is a CommonJS `export =` module and this repo does
// not set esModuleInterop, so this is the standard TS-native way to import it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import CDP = require('chrome-remote-interface')

/** A single browser tab, opened for one fetch and closed afterwards. */
export interface BrowserTarget {
  navigate(url: string): Promise<void>
  /** Waits for the page to settle, then evaluates `script` in it and returns the result. */
  extract<T>(script: string): Promise<T>
  /** Brings this tab to the front — used only when a developer needs to act in it (sign in). */
  bringToFront(): Promise<void>
  /**
   * Polls `location.href` until it no longer contains `needle`, or `timeoutMs`
   * elapses — whichever comes first. Returns whatever URL was last read
   * either way, so the caller can tell which one happened by checking it
   * again rather than needing a separate timed-out flag.
   */
  waitWhileUrlIncludes(needle: string, timeoutMs: number): Promise<string>
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

/** Where the dedicated profile lives — never inside a task's own folder. See spec Section 19. */
export function profileDir(globalStorageDir: string): string {
  return join(globalStorageDir, 'browser-fetch-profile')
}

/** One executable to try. Injected so location is testable without a real filesystem. */
export interface ExecutableProbe {
  /** The first of these paths that exists, or undefined if none do. */
  firstExisting(candidates: string[]): Promise<string | undefined>
}

const CHROME_CANDIDATES: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  win32: [
    String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
    String.raw`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'],
}

const EDGE_CANDIDATES: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  win32: [
    String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
    String.raw`C:\Program Files\Microsoft\Edge\Application\msedge.exe`,
  ],
  linux: ['/usr/bin/microsoft-edge'],
}

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

const DEFAULT_PORT = 9222

async function isReachable(port: number): Promise<boolean> {
  try {
    await CDP.Version({ port })
    return true
  } catch {
    return false
  }
}

/**
 * A client-side auth redirect (e.g. a Jira page bouncing, signed out, to its
 * identity provider on another origin) can land some time after the page's
 * own load event fires — found by testing against a real signed-out ticket,
 * where the URL sat unchanged for over half a second before the redirect
 * actually happened. Two things follow from that measurement:
 *
 * - A second `Page.loadEventFired()` does not reliably correspond to it, so
 *   is not a signal to wait on at all — tried first, and it fired too early.
 * - Polling `location.href` until two *consecutive* reads agree is not
 *   enough either: two reads taken a normal poll interval apart can both
 *   land inside that same pre-redirect pause and read as "already stable".
 *   `minDelayMs` rules that out by not taking the first reading until after
 *   the observed pause has had time to end.
 */
async function readUrl(client: CDP.Client): Promise<string> {
  const { result } = await client.Runtime.evaluate({
    expression: 'location.href',
    returnByValue: true,
  })
  return result.value as string
}

async function waitForStableUrl(
  client: CDP.Client,
  { minDelayMs = 1_200, timeoutMs = 4_000, intervalMs = 300 } = {},
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, minDelayMs))

  let previous: string | undefined
  let first = true
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const current = await readUrl(client)
    if (!first && current === previous) return
    previous = current
    first = false
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

/**
 * Waits out a developer signing in by hand. Bounded, because nothing here
 * should hold the sidebar's Fetch action open forever if they never do —
 * see `fetchEpic`'s use of this, which reports the timeout as still not
 * signed in rather than hanging.
 */
async function waitWhileUrlIncludes(
  client: CDP.Client,
  needle: string,
  timeoutMs: number,
  pollMs = 1_000,
): Promise<string> {
  const start = Date.now()
  for (;;) {
    const url = await readUrl(client)
    if (!url.includes(needle) || Date.now() - start >= timeoutMs) return url
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}

async function waitForPort(port: number, timeoutMs = 15_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await isReachable(port)) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Chromium did not open its debug port within ${timeoutMs}ms`)
}

/**
 * Attaches to the dedicated profile's browser if it is already running on the
 * debug port, otherwise launches it there. Either way, subsequent fetches in
 * the same VS Code session reuse the same running process — launching a
 * second one against the same `userDataDir` while the first is up would only
 * focus the first, per Chrome and Edge's own single-instance-per-profile
 * behaviour. See spec Section 19.
 */
export function chromiumLauncher(
  executable: string,
  userDataDir: string,
  port: number = DEFAULT_PORT,
): BrowserLauncher {
  let launchedByUs = false

  async function ensureRunning(): Promise<void> {
    if (await isReachable(port)) return
    if (!launchedByUs) {
      spawn(
        executable,
        [`--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, '--no-first-run'],
        { detached: true, stdio: 'ignore' },
      ).unref()
      launchedByUs = true
    }
    await waitForPort(port)
  }

  return {
    async session() {
      await ensureRunning()
      return {
        async openTarget() {
          const target = await CDP.New({ port })
          const client = await CDP({ port, target: target.id })
          await client.Page.enable()

          return {
            async navigate(url) {
              await client.Page.navigate({ url })
              await client.Page.loadEventFired()
              await waitForStableUrl(client)
            },
            async extract<T>(script: string): Promise<T> {
              const { result } = await client.Runtime.evaluate({
                expression: script,
                returnByValue: true,
              })
              return result.value as T
            },
            async bringToFront() {
              await client.Page.bringToFront()
            },
            async waitWhileUrlIncludes(needle, timeoutMs) {
              return waitWhileUrlIncludes(client, needle, timeoutMs)
            },
            async close() {
              // Ends the debugger connection, then destroys the tab itself —
              // closing only the connection would leave it open in the
              // developer's dedicated profile window.
              await client.close()
              await CDP.Close({ port, id: target.id })
            },
          }
        },
      }
    },
  }
}
