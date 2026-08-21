import { defineConfig } from '@vscode/test-cli'

/**
 * The integration tier. Without this file the tier cannot run at all, which is
 * how it sat for a while — `npm run test:integration` would start and find
 * nothing to do. See spec Section 11.
 *
 * `pretest:integration` runs `tsc --outDir out` first, so the tests being
 * pointed at here are the compiled output of `test/integration/`, not the
 * TypeScript. Everything else in the suite runs under vitest and is excluded
 * from this tier by `vitest.config.mjs`.
 */
export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  version: 'stable',
  mocha: {
    // VS Code's own convention, and what the tests are written against:
    // `suite` and `test` rather than `describe` and `it`.
    ui: 'tdd',
    // Two of the assertions poll a real configuration service for up to five
    // seconds each, because onDidChangeConfiguration is asynchronous and
    // guessing a delay is how a suite becomes flaky. Mocha's 2s default would
    // fail them for taking the time they are meant to take.
    timeout: 30000,
  },
})
