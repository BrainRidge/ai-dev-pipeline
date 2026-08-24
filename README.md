# AI Dev Workflow

A VS Code extension that makes the AI-assisted development process the product: a
developer picks a platform, epic and task type, and an interactive workflow walks
them through a fixed sequence of steps — checking their machine, gathering
context, getting the code, handing a composed prompt to Copilot, and reviewing
what comes back.

The point is that a new joiner follows the same path as a senior developer, and
the prompts that shape the AI's behaviour are written once by the people best
placed to write them. The design is in [`docs/spec/`](docs/spec/README.md).

## Just want to use it?

You do not need to build anything. `out/` is tracked deliberately, so the `.vsix`
in this directory installs from a bare clone:

```bash
code --install-extension ai-dev-workflow-*.vsix
```

Then set **Content Root** in Settings → Extensions → AI Dev Workflow to a folder
holding your team's `config/` and `prompts/` — copy
[`examples/content-template/`](examples/content-template/README.md) to start.
Leave it unset and the extension runs on a bundled sample: two placeholder
services that cannot be cloned, with a banner in the sidebar saying so.

## Working on it

```bash
npm ci        # dependencies are NOT committed — do this first
npm run build # esbuild the four bundles into out/
```

`npm ci` is the step people miss. Without it every other command fails with
`Cannot find package 'esbuild'`, which says nothing useful; `esbuild.mjs` now
catches that and tells you.

Node 20 or 22 (an LTS line). VS Code 1.96 or newer.

| Command | Does |
|---|---|
| `npm run verify` | typecheck, lint and the unit tiers — **the gate before a commit** |
| `npm run build` | the bundles in `out/` |
| `npm run watch` | rebuild on change |
| `npm run test:integration` | the extension-host tier, in a real VS Code |
| `npm run check:package` | what the `.vsix` would and would not contain |
| `npm run release -- minor` | verify, bump, build, check, package, write the manifest |

Press **F5** for an Extension Development Host with the extension loaded from
source. That is the fast way to look at anything in the UI, and it needs `npm ci`
first because it builds on the way in.

## Two things about this repository that surprise people

**`out/` is tracked on purpose.** `package.json`'s `main` points into it, so a
checkout stays installable without a build step. The cost is that a source change
is not finished until the bundles are rebuilt in the same commit — CI checks
exactly that, so a stale bundle fails the build rather than shipping quietly.

**Dependencies are not tracked.** They used to be, which brought 19,000 files, a
macOS quarantine flag that stopped the tests running outright, and native binaries
built for one platform. `npm ci` reproduces them from the lockfile.

## Layout

| Where | What |
|---|---|
| [`docs/spec/`](docs/spec/README.md) | the design, one file per numbered section — source comments cite it as `See spec Section 5` |
| [`docs/plans/`](docs/plans/README.md) | implementation plans, historical once shipped |
| [`docs/MANUAL-ACCEPTANCE.md`](docs/MANUAL-ACCEPTANCE.md) | the checks a person runs by hand before a release |
| `workflows/` | the workflow definitions — JSON, changed by pull request |
| `prompts/` | the bundled prompt templates, and the per-file fallback for a team's own |
| `src/` | the extension host. `src/engine/` never imports `vscode` |
| `webview/` | the renderer. Knows no workflow by name, and may not import `src/` |

Adding or changing a workflow is JSON and markdown, with no TypeScript. Adding a
new *kind* of step is one class. [Section 5](docs/spec/05-architecture.md) explains
why that line is where it is, and [`CLAUDE.md`](CLAUDE.md) has the conventions an
agent working here must not break.
