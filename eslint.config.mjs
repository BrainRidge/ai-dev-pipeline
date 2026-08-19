import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['out/**', 'node_modules/**', '.vscode-test/**', '*.mjs'] },
  ...tseslint.configs.recommended,

  // Implementing an interface often means accepting a parameter this particular
  // implementation ignores. The leading underscore marks that as deliberate.
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
    },
  },

  // Boundary 1: the renderer must never reach extension-host code.
  {
    files: ['webview/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/src/**', '../src/*'],
          message: 'The renderer must not import extension-host code. See spec Section 5.',
        }],
      }],
    },
  },

  // Boundary 2: the engine stays pure and testable without an extension host.
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: 'vscode',
          message: 'The engine must stay pure and testable without an extension host. See spec Section 5.',
        }],
      }],
    },
  },

  // Boundary 3: one seam to the webview, so there is one place to log and test.
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
