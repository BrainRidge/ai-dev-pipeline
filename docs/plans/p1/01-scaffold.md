# Task 1: Scaffold, build, lint boundaries, and activation

> Part of the [Phase 1 implementation plan](README.md). Completed and shipped.

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.mjs`, `eslint.config.mjs`, `.gitignore`, `.vscode/launch.json`
- Create: `src/extension.ts`
- Test: `test/extension.smoke.test.ts`

**Interfaces:**
- Produces: `activate(context: vscode.ExtensionContext): void`, command id `aiDevWorkflow.startTask`

- [ ] **Step 1: Initialise the repository**

```bash
cd /Users/tarun.kumar/Documents/workspace/ai-dev-workflow
git init
printf 'node_modules/\nout/\n*.vsix\n' > .gitignore
git add -A && git commit -m "chore: initial commit with design and plan"
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "ai-dev-workflow",
  "displayName": "AI Dev Workflow",
  "description": "Interactive, standardised AI-assisted development workflows",
  "version": "0.1.0",
  "publisher": "internal",
  "engines": { "vscode": "^1.96.0" },
  "categories": ["Other"],
  "main": "./out/extension.js",
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "commands": [
      { "command": "aiDevWorkflow.startTask", "title": "AI Dev Workflow: Start Task" },
      { "command": "aiDevWorkflow.resumeTask", "title": "AI Dev Workflow: Resume Task" }
    ],
    "configuration": {
      "title": "AI Dev Workflow",
      "properties": {
        "aiDevWorkflow.tasksRoot": {
          "type": "string", "default": "",
          "description": "Where task folders are created. Defaults to ~/ai-dev-workflow/tasks."
        },
        "aiDevWorkflow.updateManifestUrl": {
          "type": "string", "default": "",
          "description": "URL of a JSON manifest stating the latest published version. Empty disables the check."
        },
        "aiDevWorkflow.taskId": {
          "type": "string", "default": "",
          "description": "Set automatically in generated workspace files. Do not edit."
        }
      }
    }
  },
  "scripts": {
    "build": "node esbuild.mjs",
    "watch": "node esbuild.mjs --watch",
    "test": "vitest run",
    "test:integration": "vscode-test",
    "lint": "eslint .",
    "package": "vsce package"
  },
  "dependencies": { "yaml": "^2.5.0", "zod": "^3.23.0" },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/vscode": "^1.96.0",
    "@vscode/test-cli": "^0.0.10",
    "@vscode/test-electron": "^2.4.0",
    "@vscode/vsce": "^3.0.0",
    "esbuild": "^0.23.0",
    "eslint": "^9.0.0",
    "typescript": "^5.5.0",
    "typescript-eslint": "^8.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json` and `esbuild.mjs`**

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "Node16", "moduleResolution": "Node16",
    "lib": ["ES2022", "DOM"], "outDir": "out", "strict": true,
    "noUncheckedIndexedAccess": true, "skipLibCheck": true, "sourceMap": true
  },
  "include": ["src", "webview", "test"]
}
```

```javascript
// esbuild.mjs
import { build, context } from 'esbuild'
const watch = process.argv.includes('--watch')

const host = {
  entryPoints: ['src/extension.ts'], bundle: true, outfile: 'out/extension.js',
  platform: 'node', format: 'cjs', external: ['vscode'], sourcemap: true,
}
const webview = {
  entryPoints: ['webview/main.ts'], bundle: true, outfile: 'out/webview.js',
  platform: 'browser', format: 'iife', sourcemap: true,
}

if (watch) {
  for (const cfg of [host, webview]) (await context(cfg)).watch()
} else {
  await Promise.all([build(host), build(webview)])
}
```

- [ ] **Step 4: Create `eslint.config.mjs` with the three boundary rules**

These encode the Global Constraints. They are the mechanical substitute for TypeScript experience.

```javascript
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['out/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['webview/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['**/src/**', '../src/*'],
                     message: 'The renderer must not import extension-host code. See spec Section 5.' }],
      }],
    },
  },
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: 'vscode',
                  message: 'The engine must stay pure and testable without an extension host. See spec Section 5.' }],
      }],
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/bridge/WebviewBridge.ts'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "MemberExpression[property.name='postMessage']",
        message: 'Only WebviewBridge may call postMessage. See spec Section 5.',
      }],
    },
  },
)
```

- [ ] **Step 5: Write the failing smoke test**

```typescript
// test/extension.smoke.test.ts
import { describe, it, expect } from 'vitest'
import { buildTaskId } from '../src/engine/taskId'

describe('scaffold', () => {
  it('exposes a taskId builder', () => {
    expect(typeof buildTaskId).toBe('function')
  })
})
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npx vitest run test/extension.smoke.test.ts`
Expected: FAIL — `Cannot find module '../src/engine/taskId'`

- [ ] **Step 7: Create `src/engine/taskId.ts` and `src/extension.ts`**

```typescript
// src/engine/taskId.ts
export function sanitiseEpic(epic: string): string {
  return epic.replace(/[^A-Za-z0-9._-]/g, '-')
}

export function buildTaskId(epic: string, workflowId: string, date: Date, counter: number): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const nn = String(counter).padStart(2, '0')
  return `${sanitiseEpic(epic)}-${workflowId}-${y}${m}${d}-${nn}`
}
```

```typescript
// src/extension.ts
import * as vscode from 'vscode'

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('aiDevWorkflow.startTask', async () => {
      await vscode.window.showInformationMessage('AI Dev Workflow: start task (not yet implemented)')
    }),
    vscode.commands.registerCommand('aiDevWorkflow.resumeTask', async () => {
      await vscode.window.showInformationMessage('AI Dev Workflow: resume task (not yet implemented)')
    }),
  )
}

export function deactivate(): void {}
```

- [ ] **Step 8: Run the test and the lint**

Run: `npx vitest run && npm run lint && npm run build`
Expected: test PASS, lint clean, `out/extension.js` and `out/webview.js` produced.

(`out/webview.js` requires a stub `webview/main.ts` containing `export {}` — create it.)

- [ ] **Step 9: Verify F5 debugging works**

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [{
    "name": "Run Extension", "type": "extensionHost", "request": "launch",
    "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
    "preLaunchTask": "npm: build"
  }]
}
```

Press F5, run **AI Dev Workflow: Start Task** from the palette, confirm the notification appears. This de-risks the whole toolchain before any real logic exists.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat: scaffold extension with build, lint boundaries and activation"
```
