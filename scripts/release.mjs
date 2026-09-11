/**
 * Cuts a release: verify, bump, build, package both plugins, and write the
 * update manifest.
 *
 *   node scripts/release.mjs            repackage the current version
 *   node scripts/release.mjs patch      prompt or wording changes only
 *   node scripts/release.mjs minor      new steps, settings or workflows
 *   node scripts/release.mjs major      anything a task in flight could not survive
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
 *
 * The version now lives in three files — core, the VS Code manifest and the
 * IntelliJ gradle.properties — because three packages ship from this tree. They
 * are bumped together here and `check:parity` refuses a tree where they differ,
 * so the two plugins cannot be released at different versions. See Section 19.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkPackage, wouldShip } from '../tool/vscode-plugin/package-check.mjs'

const ROOT = join(import.meta.dirname, '..')
const VSCODE = join(ROOT, 'tool', 'vscode-plugin')
const INTELLIJ = join(ROOT, 'tool', 'intellij-plugin')
const DIST = join(ROOT, 'dist')
const BUMPS = ['patch', 'minor', 'major']
const MANIFEST = 'update-manifest.json'

function run(command, args, cwd = ROOT) {
  console.log(`\n$ ${command} ${args.join(' ')}`)
  execFileSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
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

/**
 * Puts the version into the two files `npm version` does not reach.
 *
 * The workspaces move with the root because npm bumps them, but the IntelliJ
 * build reads gradle.properties and knows nothing about npm. Left alone it
 * would ship the previous version under this release's name, which is the
 * quietest possible way to confuse a support request.
 */
function syncVersions(version) {
  const gradle = join(INTELLIJ, 'gradle.properties')
  writeFileSync(
    gradle,
    readFileSync(gradle, 'utf8').replace(/^(\s*pluginVersion\s*=\s*).*$/m, `$1${version}`),
    'utf8',
  )

  for (const pkg of [join(ROOT, 'tool', 'core', 'package.json'), join(VSCODE, 'package.json')]) {
    const json = JSON.parse(readFileSync(pkg, 'utf8'))
    if (json.version === version) continue
    json.version = version
    writeFileSync(pkg, `${JSON.stringify(json, null, 2)}\n`, 'utf8')
  }
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
if (bump) {
  run('npm', ['version', bump, '--no-git-tag-version', '--workspaces', '--include-workspace-root'])
  syncVersions(versionNow())
}

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
  run('npm', [
    'version', before, '--no-git-tag-version', '--allow-same-version',
    '--workspaces', '--include-workspace-root',
  ])
  syncVersions(before)
}

process.on('exit', (code) => {
  if (code !== 0) rollBack()
})

const version = versionNow()
console.log(`\n── releasing ${version} ──`)

// The renderer and the engine are built once, in core, and both plugins copy
// them. package.json's `main` points into out/, so those bundles are the
// release. See spec Section 19.
run('npm', ['run', 'build:vscode'])

// -------------------------------------------------- what would ship, checked
//
// Before packaging, not after. `vsce ls` reports the same file list `vsce
// package` would write, so checking first means a failure leaves no artifact at
// all — rather than a broken .vsix sitting where a good one used to be, which
// is precisely the stale-package trap this script exists to close.

const shipped = wouldShip(VSCODE)
const problems = checkPackage(shipped)
if (problems.length > 0) fail(problems.join('\n\n✗ '))

console.log(`\n✓ package will contain ${shipped.length} files, and nothing it should not`)

// ------------------------------------------------------------- the artifact

run(
  'npx',
  ['vsce', 'package', '--skip-license', '--no-dependencies', '--out', DIST],
  VSCODE,
)

const vsix = `ai-dev-workflow-${version}.vsix`
const packaged = readdirSync(DIST).filter((f) => /^ai-dev-workflow-.*\.vsix$/.test(f))
if (!packaged.includes(vsix)) fail(`expected ${vsix} to have been written, and it was not`)

// One installable artifact per IDE, so "the .vsix" is never ambiguous.
for (const stale of packaged.filter((f) => f !== vsix)) {
  unlinkSync(join(DIST, stale))
  console.log(`removed ${stale}`)
}

// ------------------------------------------------------- the IntelliJ plugin
//
// Built from the same core, at the same version, in the same run — because a
// release that ships one IDE and not the other is exactly the drift this
// structure exists to prevent. See spec Section 19.

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
run(gradlew, ['buildPlugin', '--quiet'], INTELLIJ)

const zipName = `ai-dev-workflow-intellij-${version}.zip`
const built = join(INTELLIJ, 'build', 'distributions', `ai-dev-workflow-intellij-${version}.zip`)
copyFileSync(built, join(DIST, zipName))

// ------------------------------------------------------------- the manifest

const sha256 = createHash('sha256').update(readFileSync(join(DIST, vsix))).digest('hex')

// The shape `UpdateCheck` reads: it needs `version` and ignores the rest. The
// rest is for whoever hosts this — a checksum to verify a download against, and
// a filename so the manifest says what to fetch. See spec Section 13.
writeFileSync(
  join(ROOT, MANIFEST),
  `${JSON.stringify(
    {
      version,
      vsix,
      sha256,
      intellij: zipName,
      intellijSha256: createHash('sha256')
        .update(readFileSync(join(DIST, zipName)))
        .digest('hex'),
      released: new Date().toISOString().slice(0, 10),
    },
    null,
    2,
  )}\n`,
  'utf8',
)

console.log(`
── ${version} is ready ──

  dist/${vsix}   (${(readFileSync(join(DIST, vsix)).length / 1024).toFixed(0)} KB)
  dist/${zipName}   (${(readFileSync(join(DIST, zipName)).length / 1024).toFixed(0)} KB)
  ${MANIFEST}

Next, by hand:
  1. git add -A && git commit    — the three package.json files, gradle.properties,
                                   package-lock.json, tool/vscode-plugin/out/, both
                                   artifacts and ${MANIFEST} belong in one commit
  2. git tag v${version}
  3. copy both files to the internal artifact location the developers'
     aiDevWorkflow.updateManifestUrl points at

Until step 3 happens, the startup update check stays silent — it compares the
installed version against that manifest and nothing else.
`)
