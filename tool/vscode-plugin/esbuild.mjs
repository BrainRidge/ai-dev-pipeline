import { cp, rm } from 'node:fs/promises'

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
        'install them before it can build. `npm ci` at the repository root installs\n' +
        'every workspace at once.\n\n' +
        'You do not need this to *run* the extension — out/ is tracked, so the .vsix\n' +
        'in dist/ installs on a bare clone. It is needed to build, test or press F5.\n',
    )
    process.exit(1)
  }
}

const watch = process.argv.includes('--watch')

/** The renderer and the shared content both live in core. See spec Section 19. */
const CORE = '../core'

/**
 * The extension resolves `workflows/`, `prompts/` and `examples/` against its
 * own installation directory at runtime, so they have to sit at the packaged
 * root. They are authored once in core and copied here at build time — the
 * copies are gitignored and must never be hand-edited, because the next build
 * overwrites them. This is what stops the two plugins shipping different
 * workflows. See spec Section 19.
 */
async function copyContent() {
  for (const dir of ['workflows', 'prompts', 'examples']) {
    await rm(dir, { recursive: true, force: true })
    await cp(`${CORE}/${dir}`, dir, { recursive: true })
  }
}

/**
 * The renderer is built once, by core, and copied here. This plugin does not
 * build it, so it cannot ship a version the IntelliJ plugin does not have.
 * The .map files are copied too and then excluded by .vscodeignore, because
 * they are what makes the tracked bundles debuggable in a dev checkout.
 */
async function copyRenderer() {
  await cp(`${CORE}/out/renderer`, 'out', { recursive: true })
}

const host = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: true,
}

await copyContent()
await copyRenderer()

if (watch) {
  const ctx = await context(host)
  await ctx.watch()
  console.log('watching the host bundle. `npm run watch -w @ai-dev-pipeline/core` for the renderer.')
} else {
  await build(host)
}
