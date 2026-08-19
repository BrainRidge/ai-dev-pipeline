# Task 16: Packaging and update check

> Part of the [Phase 1 implementation plan](README.md). Completed and shipped.

**Files:**
- Create: `src/update/UpdateCheck.ts`, `.vscodeignore`
- Modify: `src/extension.ts`
- Test: `test/update/UpdateCheck.test.ts`

**Interfaces:**
- Produces: `isNewer(current: string, latest: string): boolean`, `checkForUpdate(deps): Promise<string | undefined>`

- [ ] **Step 1: Write the failing test**

```typescript
// test/update/UpdateCheck.test.ts
import { describe, it, expect } from 'vitest'
import { isNewer, checkForUpdate } from '../../src/update/UpdateCheck'

describe('isNewer', () => {
  it('compares semver numerically, not lexically', () => {
    expect(isNewer('0.9.0', '0.10.0')).toBe(true)
    expect(isNewer('1.2.3', '1.2.3')).toBe(false)
    expect(isNewer('2.0.0', '1.9.9')).toBe(false)
  })
})

describe('checkForUpdate', () => {
  it('is skipped when no manifest url is configured', async () => {
    expect(await checkForUpdate({ manifestUrl: '', currentVersion: '1.0.0',
                                  fetchJson: async () => ({ version: '2.0.0' }) })).toBeUndefined()
  })

  it('returns the newer version when one exists', async () => {
    expect(await checkForUpdate({ manifestUrl: 'https://x/m.json', currentVersion: '1.0.0',
                                  fetchJson: async () => ({ version: '1.1.0' }) })).toBe('1.1.0')
  })

  it('stays silent when the manifest is unreachable', async () => {
    expect(await checkForUpdate({ manifestUrl: 'https://x/m.json', currentVersion: '1.0.0',
                                  fetchJson: async () => { throw new Error('offline') } })).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run test/update/UpdateCheck.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/update/UpdateCheck.ts`**

```typescript
export function isNewer(current: string, latest: string): boolean {
  const a = current.split('.').map(Number)
  const b = latest.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((b[i] ?? 0) > (a[i] ?? 0)) return true
    if ((b[i] ?? 0) < (a[i] ?? 0)) return false
  }
  return false
}

export async function checkForUpdate(deps: {
  manifestUrl: string
  currentVersion: string
  fetchJson: (url: string) => Promise<{ version: string }>
}): Promise<string | undefined> {
  if (!deps.manifestUrl) return undefined       // unset disables the check entirely
  try {
    const manifest = await deps.fetchJson(deps.manifestUrl)
    return isNewer(deps.currentVersion, manifest.version) ? manifest.version : undefined
  } catch {
    return undefined                             // never nag about a network failure
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/update/UpdateCheck.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire it into activation and add `.vscodeignore`**

```
.vscode/**
test/**
webview/**
src/**
docs/**
node_modules/**
*.mjs
tsconfig.json
```

Note `out/**`, `workflows/**` and `prompts/**` are **not** ignored — they must ship.

- [ ] **Step 6: Produce a `.vsix` and install it**

```bash
npm run build && npx vsce package
code --install-extension ai-dev-workflow-0.1.0.vsix
```

Expected: installs without error; **AI Dev Workflow: Start Task** appears in the command palette of a normal VS Code window.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: packaging and startup update check"
```
