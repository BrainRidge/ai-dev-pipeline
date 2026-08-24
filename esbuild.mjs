const { build, context } = await esbuild()

/**
 * esbuild, or an explanation.
 *
 * Imported dynamically rather than at the top of the file because a static
 * import fails during module resolution, before any code here runs — so the
 * only thing a fresh clone saw was Node's own ERR_MODULE_NOT_FOUND, which says
 * nothing about what to do. Dependencies are no longer committed (see the root
 * README), so this is the first thing anybody hits after cloning, and it is
 * worth one clear sentence.
 */
async function esbuild() {
  try {
    return await import('esbuild')
  } catch (err) {
    if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err
    console.error(
      '\nesbuild is not installed.\n\n' +
        '  npm ci\n\n' +
        'Dependencies are not committed to this repository, so a fresh clone has to\n' +
        'install them before it can build. `npm ci` installs exactly what\n' +
        'package-lock.json pins.\n\n' +
        'You do not need this to *run* the extension — out/ is tracked, so the .vsix\n' +
        'in the repository root installs on a bare clone. It is needed to build, test\n' +
        'or press F5.\n',
    )
    process.exit(1)
  }
}

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
