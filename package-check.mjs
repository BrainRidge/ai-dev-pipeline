/**
 * Asserts that the .vsix would contain what the extension needs and nothing
 * else. Run on its own with `npm run check:package`, and by `release.mjs`
 * before it writes an artifact.
 *
 * It exists because packaging has already regressed once, silently: with no
 * `.vscodeignore` the package went from 20 files to 1,093 and nothing failed.
 * A file count would be brittle — adding a prompt changes it — so this names
 * what must be there and describes what must not. See spec Sections 10 and 13.
 */
import { execFileSync } from 'node:child_process'

/** Every file the extension cannot run without, named individually. */
export const MUST_SHIP = [
  'package.json',
  'media/icon.svg',
  'out/extension.js',
  'out/webview.js',
  'out/setup.js',
  'out/style.css',
  'workflows/researchTaskWorkflow_1_0.json',
  'workflows/newFeatureWorkflow_1_0.json',
  'workflows/bugFixWorkflow_1_0.json',
  // The include: target. A package without it composes a broken prompt on the
  // two coding steps, and nothing else would notice. See spec Section 8.
  'prompts/_shared/house-rules.md',
  // What an unconfigured install runs on, as well as the layout a team copies.
  // See spec Section 16.
  'examples/content-template/config/microservices.json',
  'examples/content-template/config/platforms.json',
  'examples/content-template/config/tools.json',
  'examples/content-template/README.md',
  // The persona example. A team copies it out of the installed extension, so it
  // has to be in the package. See spec Section 6.
  'examples/content-template/prompts/skills/example-persona.md',
]

/** Anything matching these must not be in the package. */
export const MUST_NOT_SHIP = [
  ['source', (f) => f.startsWith('src/')],
  ['tests', (f) => f.startsWith('test/')],
  ['documentation', (f) => f.startsWith('docs/')],
  ['dependencies', (f) => f.startsWith('node_modules/')],
  [
    'unbundled tsc output',
    (f) => f.startsWith('out/src/') || f.startsWith('out/test/') || f.startsWith('out/webview/'),
  ],
  ['sourcemaps', (f) => f.endsWith('.map')],
  ['the browser dev harness', (f) => f === 'out/dev.js'],
  ['a nested package', (f) => f.endsWith('.vsix')],
  ['the update manifest', (f) => f === 'update-manifest.json'],
  ['agent instructions', (f) => f === 'CLAUDE.md'],
]

/**
 * The files `vsce package` would write. `vsce ls` reports the same list without
 * producing an artifact, which is what lets this run before packaging rather
 * than after — so a failure never leaves a broken .vsix where a good one was.
 */
export function wouldShip(cwd) {
  return execFileSync('npx', ['vsce', 'ls'], {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** Returns the problems found. Empty means the package is right. */
export function checkPackage(shipped) {
  const problems = []

  const missing = MUST_SHIP.filter((f) => !shipped.includes(f))
  if (missing.length > 0) {
    problems.push(
      `.vscodeignore is excluding files the extension needs:\n  ${missing.join('\n  ')}`,
    )
  }

  for (const [what, matches] of MUST_NOT_SHIP) {
    const leaked = shipped.filter((f) => matches(f))
    if (leaked.length > 0) {
      problems.push(
        `.vscodeignore is letting ${what} through (${leaked.length} file(s)):\n  ` +
          `${leaked.slice(0, 5).join('\n  ')}${leaked.length > 5 ? '\n  …' : ''}`,
      )
    }
  }

  return problems
}

// Run directly: `node package-check.mjs`
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
  const shipped = wouldShip(import.meta.dirname)
  const problems = checkPackage(shipped)

  if (problems.length > 0) {
    console.error(`\n✗ ${problems.join('\n\n✗ ')}\n`)
    process.exit(1)
  }
  console.log(`✓ the package would contain ${shipped.length} files, and nothing it should not`)
}
