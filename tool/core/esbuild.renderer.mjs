/**
 * Builds the renderer once, for every host.
 *
 * The bundles land in `tool/core/out/renderer/` and each plugin copies them
 * into its own package: the .vsix serves them from `out/`, the IntelliJ jar
 * from its resources. Neither plugin builds them, so neither can ship a
 * renderer the other does not have. See spec Section 19.
 */
import { build } from 'esbuild'

const OUT = 'out/renderer'

const browser = (entry, outfile) => ({
  entryPoints: [entry],
  bundle: true,
  outfile: `${OUT}/${outfile}`,
  platform: 'browser',
  format: 'iife',
  sourcemap: true,
})

await Promise.all([
  // Pane 2, the workflow stepper.
  build(browser('webview/main.ts', 'webview.js')),
  // Pane 1, the setup form. Reuses the same renderer.
  build(browser('webview/setup.ts', 'setup.js')),
  // Browser-only harness: lets the renderer be developed with no IDE running.
  build(browser('webview/fixtures/dev.ts', 'dev.js')),
  // Served as files, not inlined, so they are cached and the CSP can stay
  // strict. Pane 2 is styled by style.css and pane 1 by setup.css; both hosts
  // load the same two. See spec Section 9.
  build({ entryPoints: ['webview/style.css'], bundle: true, outfile: `${OUT}/style.css` }),
  build({ entryPoints: ['webview/setup.css'], bundle: true, outfile: `${OUT}/setup.css` }),
])

console.log(`renderer → ${OUT}`)
