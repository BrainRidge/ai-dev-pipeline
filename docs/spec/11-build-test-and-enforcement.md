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
