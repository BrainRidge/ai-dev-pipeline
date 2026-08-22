# 13. Release and distribution

> Part of the [AI Dev Workflow Phase 1 design](README.md).

Semantic versioning. Prompt-only edits are patch releases; a new step type, setting or
workflow is a minor one. Because tasks snapshot their workflow (D8), a release can never
disturb work in flight.

## Cutting one

`npm run release -- minor` — or `patch`, `major`, or nothing at all to repackage the current
version. It is a script rather than a list of commands in this document because the order
matters and getting it wrong is silent:

1. `npm run verify` — before the bump, so a failing gate leaves the version alone
2. `npm version <bump> --no-git-tag-version` — package.json and the lockfile, and nothing in
   git. Three dependencies happen to sit at `0.1.0`, so hand-editing the lockfile is a trap
3. `npm run build` — `main` points into `out/`, so the bundles *are* the release
4. **checks what would ship, before writing anything** — every file the extension needs is
   present, and nothing from `src/`, `test/`, `docs/`, `node_modules/` or a sourcemap is
5. `vsce package` → `ai-dev-workflow-<version>.vsix`, and any older `.vsix` is removed so
   that "the .vsix" is never ambiguous
6. writes `update-manifest.json`

Step 4 is before step 5 deliberately. `vsce ls` reports the same list `vsce package` would
write, so a failure leaves no artifact rather than a broken one sitting where a good one used
to be. That check exists because packaging has already regressed once, silently: with no
`.vscodeignore` the package went from 20 files to 1,093, and nothing failed.

The script does not commit or tag. What to commit is printed at the end for a person to do,
because `package.json`, the lockfile, `out/`, the `.vsix` and the manifest have to land in one
commit or the tracked artifact stops matching the source that built it.

## The manifest is what makes the version mean anything

`aiDevWorkflow.updateManifestUrl` points at a JSON file stating the latest version, and
`UpdateCheck.isNewer` compares three numeric segments of it against the installed
`package.json` version. Two consequences worth stating plainly:

- **A version that never changes disables the check.** It sat at `0.1.0` while three features
  shipped, so no developer could have been told to update.
- **A version that is not `x.y.z` disables the check silently.** `isNewer` parses each segment
  with `Number`, and a `NaN` compares false both ways — so a build tag in the version means
  "never newer" rather than an error. Keep `package.json` strictly numeric; if a build needs
  identifying beyond its version, name the file, not the field.

```json
{
  "version": "0.2.0",
  "vsix": "ai-dev-workflow-0.2.0.vsix",
  "sha256": "f1427f7e…",
  "released": "2026-08-21"
}
```

`version` is the only key the extension reads. The rest is for whoever hosts the file: a
checksum to verify a download against, and a filename saying what to fetch.

Distribution is by `.vsix` published to an internal artifact location, from which developers
install manually (D7).

The artifact is built by `npm run release` on a maintainer's machine, not by CI. CI verifies —
it runs the gate, checks the bundles match their source and checks what the package would
contain ([Section 11](11-build-test-and-enforcement.md)) — but it does not publish, because
the internal location is not something a public runner should hold credentials for. The
earlier claim in this section that the `.vsix` was "built in CI" was never true, and while
there was no CI at all it was doubly so.

The extension does not hardcode that location. It reads a setting,
`aiDevWorkflow.updateManifestUrl`, pointing at a JSON manifest that states the latest
version. At startup the extension fetches it and notifies the developer if a newer version
exists. Choosing the actual hosting location is an organisational decision that can be made
after implementation without changing any code; if the setting is unset, the version check
is silently skipped.

**Known risk:** manual installation means no auto-update, so versions will drift across a
large team. The startup check mitigates this; it does not solve it. If version drift becomes
a real operational problem, revisiting distribution is the correct response rather than
adding complexity elsewhere.
