import { build, context } from 'esbuild'

const watch = process.argv.includes('--watch')

const host = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: true,
}

const webview = {
  entryPoints: ['webview/main.ts'],
  bundle: true,
  outfile: 'out/webview.js',
  platform: 'browser',
  format: 'iife',
  sourcemap: true,
}

// The panel's stylesheet is served as a file, not inlined, so it is cached and
// the CSP can stay strict.
const styles = {
  entryPoints: ['webview/style.css'],
  bundle: true,
  outfile: 'out/style.css',
}

// The activity-bar sidebar (pane 1). Reuses the same renderer as the panel.
const setup = {
  entryPoints: ['webview/setup.ts'],
  bundle: true,
  outfile: 'out/setup.js',
  platform: 'browser',
  format: 'iife',
  sourcemap: true,
}

// Browser-only harness: lets the renderer be developed with no extension host.
const devHarness = {
  entryPoints: ['webview/fixtures/dev.ts'],
  bundle: true,
  outfile: 'out/dev.js',
  platform: 'browser',
  format: 'iife',
  sourcemap: true,
}

if (watch) {
  for (const cfg of [host, webview, styles, setup, devHarness]) {
    const ctx = await context(cfg)
    await ctx.watch()
  }
  console.log('watching...')
} else {
  await Promise.all([build(host), build(webview), build(styles), build(setup), build(devHarness)])
}
