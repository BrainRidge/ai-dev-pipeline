import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/out/**',
      '**/node_modules/**',
      '**/.vscode-test/**',
      'tool/intellij-plugin/build/**',
      // Generated copies of core content. See spec Section 19.
      'tool/vscode-plugin/workflows/**',
      'tool/vscode-plugin/prompts/**',
      'tool/vscode-plugin/examples/**',
      '**/*.mjs',
    ],
  },
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

  // Boundary 1: the renderer must never reach host code.
  {
    files: ['tool/core/webview/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/src/**', '../src/*'],
          message: 'The renderer must not import extension-host code. See spec Section 5.',
        }],
      }],
    },
  },

  // Boundary 2: core is IDE-independent, and that is the whole basis of the
  // two-plugin structure. It used to cover only src/engine; it now covers every
  // line of shared code, because anything here that imports an IDE API is a line
  // the other plugin cannot run. See spec Sections 5 and 19.
  {
    files: ['tool/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: 'vscode',
            message:
              'tool/core must run in both IDEs. Add the capability to HostPort and ' +
              'implement it in each plugin instead. See spec Section 19.',
          },
        ],
      }],
    },
  },

  // Boundary 3: one seam to the rendered view, so there is one place to log and
  // test. Core reaches it through Transport; each host writes exactly one
  // adapter, and only that adapter may call postMessage. See spec Section 19.
  {
    files: ['tool/core/src/**/*.ts', 'tool/vscode-plugin/src/**/*.ts'],
    ignores: [
      'tool/core/src/bridge/WebviewBridge.ts',
      'tool/vscode-plugin/src/bridge/vscodeTransport.ts',
    ],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "MemberExpression[property.name='postMessage']",
        message: 'Only WebviewBridge and a host transport adapter may call postMessage. See spec Section 5.',
      }],
    },
  },
)
