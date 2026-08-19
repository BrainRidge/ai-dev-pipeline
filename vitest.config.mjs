import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Integration tests run under @vscode/test-cli, not vitest.
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
  },
})
