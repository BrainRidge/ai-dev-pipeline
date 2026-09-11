# Task 4: Node discovery and the IntelliJ wiring

> Part of the [IntelliJ setup pane plan](README.md).

`Sidecar` takes `(nodeExecutable, bundlePath, environment)` and nothing
supplies any of the three. `RendererPanel` builds a JCEF browser and drops
every message the page sends.

**Where Node comes from.** VS Code never needed this question answered: the
extension host *is* Node. A JVM plugin has to find one. A tenth setting is the
obvious answer and the wrong one — `check:parity` asserts the two plugins
expose the same settings, and VS Code has no use for a Node path, so adding it
to one side fails the gate and adding it to both puts a dead setting in the
VS Code UI. So: discover it. `PATH` first, then the common install locations,
and report a clear failure in the pane when there is none — an unconfigured
machine must say "Node 20+ was not found" and not draw a blank panel, which is
the bug this whole plan exists to fix.

**Environment.** `session.ts` reads eight variables. They map onto the nine
settings that already exist, via the same `resolveAll` the VS Code side uses —
which means the resolution happens in core and the Kotlin side only passes
strings.

**Files:**
- Create: `.../sidecar/NodeDiscovery.kt`
- Create: `.../sidecar/SetupSession.kt` — owns `Sidecar`, wires it to a panel
- Modify: `.../ui/RendererPanel.kt` — `handle()` forwards; expose `post`
- Modify: `.../ui/SetupToolWindowFactory.kt` — construct the session
- Create: `.../test/.../NodeDiscoveryTest.kt`

**Constraint:** `RendererPanel` must not learn what a workflow is. It forwards
JSON and posts JSON.

---

- [ ] **Step 1: `NodeDiscovery`** — `PATH`, then `/usr/local/bin`,
  `/opt/homebrew/bin`, `~/.nvm/versions/node/*/bin`, nvm's `default` alias;
  verify by running `node --version` and parsing a major ≥ 20.

- [ ] **Step 2: `SetupSession`** — spawn, `hello` handshake (it already
  refuses a version mismatch), `setupReady`, then forward both directions.

- [ ] **Step 3: `RendererPanel.handle()` forwards** to a listener the session
  installs; `dispose` closes the sidecar.

- [ ] **Step 4: The failure path** — no Node, a handshake mismatch, or a dead
  process each render a message in the pane.

- [ ] **Step 5: `npm run verify`, `npm run build:intellij`, `runIde`.**
