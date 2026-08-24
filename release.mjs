/**
 * Cuts a release: verify, bump, build, package, and write the update manifest.
 *
 *   node release.mjs            repackage the current version
 *   node release.mjs patch      prompt or wording changes only
 *   node release.mjs minor      new steps, settings or workflows
 *   node release.mjs major      anything a task in flight could not survive
 *
 * Or through npm, which is how it is meant to be run:
 *
 *   npm run release -- minor
 *
 * Why a script rather than a list of commands in a document: the order matters
 * and getting it wrong is silent. Packaging before building ships the previous
 * bundles. Bumping before verifying leaves a failed release half-applied. And
 * the .vsix is tracked in git, so a stale one looks exactly like a fresh one —
 * which has already happened once.
 *
 * It deliberately does not commit or tag. `npm version --no-git-tag-version`
 * keeps package.json and package-lock.json in step without touching git, and
 * what to commit is printed at the end for a person to do. See spec Section 13.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkPackage, wouldShip } from './package-check.mjs'

const ROOT = import.meta.dirname
const BUMPS = ['patch', 'minor', 'major']
const MANIFEST = 'update-manifest.json'

function run(command, args) {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  execFileSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
}

function capture(command, args) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    // The default 1MB is not enough. Untracking node_modules staged 19,000
    // deletions, and `git status --porcelain` then printed 1.1MB — which killed
    // this script at the first command it ran.
    maxBuffer: 64 * 1024 * 1024,
  })
}

function versionNow() {
  return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
}

function fail(message) {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

// ---------------------------------------------------------------- the release

const bump = process.argv[2]
if (bump !== undefined && !BUMPS.includes(bump)) {
  fail(`unknown bump "${bump}". Expected one of ${BUMPS.join(', ')}, or nothing to repackage.`)
}

// Not fatal: the artifact is named by version alone, so it cannot record which
// commit it came from and there is no honest way to refuse on the developer's
// behalf. Saying so is the most this can do.
const dirty = capture('git', ['status', '--porcelain']).trim()
if (dirty !== '') {
  const count = dirty.split('\n').length
  console.log(
    `\n⚠ ${count} uncommitted change${count === 1 ? '' : 's'} in the tree. The .vsix will ` +
      `contain them, and its name records only the version — so nobody will be able to tell ` +
      `this build from the released one. Commit first unless this is a trial run.`,
  )
}

// Before the bump, so a failing gate leaves the version alone.
run('npm', ['run', 'verify'])

const before = versionNow()
if (bump) run('npm', ['version', bump, '--no-git-tag-version'])

/**
 * Puts the version back when a later step fails.
 *
 * Verify running before the bump was not enough: a failure in the build, the
 * package check or `vsce package` still left package.json and the lockfile
 * moved while the .vsix and the manifest stayed where they were — a
 * half-released tree, which is the exact inconsistency this script exists to
 * prevent. That happened once, when a new README's relative links made `vsce
 * package` refuse for want of a `repository` field.
 */
function rollBack() {
  if (!bump || versionNow() === before) return
  console.error(`\nputting the version back to ${before}`)
  run('npm', ['version', before, '--no-git-tag-version', '--allow-same-version'])
}

process.on('exit', (code) => {
  if (code !== 0) rollBack()
})

const version = versionNow()
console.log(`\n── releasing ${version} ──`)

// package.json's `main` points into out/, so the bundles are the release.
run('npm', ['run', 'build'])

// -------------------------------------------------- what would ship, checked
//
// Before packaging, not after. `vsce ls` reports the same file list `vsce
// package` would write, so checking first means a failure leaves no artifact at
// all — rather than a broken .vsix sitting where a good one used to be, which
// is precisely the stale-package trap this script exists to close.

const shipped = wouldShip(ROOT)
const problems = checkPackage(shipped)
if (problems.length > 0) fail(problems.join('\n\n✗ '))

console.log(`\n✓ package will contain ${shipped.length} files, and nothing it should not`)

// ------------------------------------------------------------- the artifact

run('npx', ['vsce', 'package', '--skip-license'])

const vsix = `ai-dev-workflow-${version}.vsix`
const packaged = readdirSync(ROOT).filter((f) => /^ai-dev-workflow-.*\.vsix$/.test(f))
if (!packaged.includes(vsix)) fail(`expected ${vsix} to have been written, and it was not`)

// One installable artifact in the tree, so "the .vsix" is never ambiguous.
for (const stale of packaged.filter((f) => f !== vsix)) {
  unlinkSync(join(ROOT, stale))
  console.log(`removed ${stale}`)
}

// ------------------------------------------------------------- the manifest

const sha256 = createHash('sha256').update(readFileSync(join(ROOT, vsix))).digest('hex')

// The shape `UpdateCheck` reads: it needs `version` and ignores the rest. The
// rest is for whoever hosts this — a checksum to verify a download against, and
// a filename so the manifest says what to fetch. See spec Section 13.
writeFileSync(
  join(ROOT, MANIFEST),
  `${JSON.stringify(
    { version, vsix, sha256, released: new Date().toISOString().slice(0, 10) },
    null,
    2,
  )}\n`,
  'utf8',
)

console.log(`
── ${version} is ready ──

  ${vsix}   (${(readFileSync(join(ROOT, vsix)).length / 1024).toFixed(0)} KB)
  ${MANIFEST}

Next, by hand:
  1. git add -A && git commit    — package.json, package-lock.json, out/, the
                                   .vsix and ${MANIFEST} belong in one commit
  2. git tag v${version}
  3. copy both files to the internal artifact location the developers'
     aiDevWorkflow.updateManifestUrl points at

Until step 3 happens, the startup update check stays silent — it compares the
installed version against that manifest and nothing else.
`)
