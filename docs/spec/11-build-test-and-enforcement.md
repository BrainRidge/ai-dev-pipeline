# 11. Build, test and enforcement

> Part of the [AI Dev Workflow Phase 1 design](README.md).

## Boundary enforcement

Three of the invariants in [Section 5](05-architecture.md) are enforced by ESLint rules,
serving the role ArchUnit serves in Java. Each rule's message names the spec section it
comes from, so a developer who trips one is told why rather than merely told no.

| Rule | Enforces |
|---|---|
| `webview/**` may not import `**/src/**` | The renderer never reaches extension-host code |
| `postMessage` may appear only in `src/bridge/WebviewBridge.ts` | One seam to the webview |
| `src/engine/**` may not import `vscode` | The engine is testable without an extension host |

Mechanical enforcement matters more than usual here: the maintaining team does not have deep
TypeScript instincts to fall back on, so the linter carries what experience would otherwise
carry.

The remaining invariants are not mechanically enforced. "One class per primitive" and
"`AuditLog` is written before the action it describes" are held by tests and by review.

## Build

esbuild produces four bundles into `out/`: the extension host (node/cjs), the workflow
panel, the sidebar, and a browser harness for developing the renderer without VS Code. The
panel's stylesheet is copied alongside them. `npm run build` runs it; `npm run watch`
rebuilds on change.

## Tests

| Tier | Covers | Requires VS Code | Command |
|---|---|---|---|
| Unit | Engine transitions, task types, schema validation, sidebar rules, the composed prompts of every bundled workflow | No | `npm test` |
| Renderer | Descriptor fixtures rendered under jsdom | No | `npm test` |
| Integration | Activation, resume-after-reload, workspace file authoring, snapshot tampering | Yes | `npm run test:integration` |

`npm run verify` runs typecheck, lint and the unit tiers together, and is the gate before a
commit.

Most logic lives in the first two tiers, keeping the feedback loop fast for developers who
are not fluent in this stack. The unit tier includes one test per bundled workflow that runs
it end to end against its real JSON, its real prompt templates and the real microservice
catalogue — those are what prove the configuration and the code agree, where every other
test uses fixtures.

The integration tier is configured by `.vscode-test.mjs`, which points
`@vscode/test-cli` at the compiled tests under `out/test/integration/`.
`pretest:integration` runs `tsc` to produce them. Without that file the tier
cannot run at all, which is how it sat for a while — it is now covered by the
same command it always claimed.

## Continuous integration

`.github/workflows/verify.yml` runs on every pull request and on pushes to
`main`. Two jobs, split so a slow VS Code download cannot delay the fast
feedback:

| Job | Runs |
|---|---|
| `verify` | `npm ci`, `npm run verify`, the bundle-freshness check, `npm run check:package` |
| `integration` | `xvfb-run -a npm run test:integration` — a real extension host needs a display |

Two of those checks exist because of failures that had already happened rather
than out of caution.

**The bundles must match their source.** `out/` is tracked and `package.json`'s
`main` points into it ([Section 10](10-repository-layout.md)), so a commit that
edits `src/` without rebuilding ships stale code *while every test passes* —
the tests run against TypeScript, and the extension runs the bundle. CI rebuilds
and fails on any diff in the four bundles and the stylesheet. It rests on esbuild
being deterministic for the same inputs and version, which `npm ci` pins and
which is worth knowing is the assumption. The `.map` files are deliberately not
compared: they never ship, and comparing them would fail on a path difference
between a runner and a laptop rather than on real drift.

**The package must contain what the extension needs, and nothing else.**
`package-check.mjs` names every file that must ship and describes what must not —
sources, tests, docs, dependencies, sourcemaps, the browser dev harness. A file
count would be brittle, since adding one prompt changes it. The same module is
called by `release.mjs` before it writes an artifact, so CI and a release cannot
disagree about what a correct package looks like. This exists because packaging
regressed from 20 files to 1,093 with nothing failing.

What CI deliberately does **not** do is publish. See
[Section 13](13-release-and-distribution.md).
