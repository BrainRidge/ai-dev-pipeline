# Task 0: Spec Section 19

> Part of the [IntelliJ setup pane plan](README.md).

Six files cite "spec Section 19" — `build.gradle.kts`, `gradle.properties`,
`IntellijHost.kt`, `RendererPanel.kt`, `SetupToolWindowFactory.kt`,
`StartTaskAction.kt`, plus `check-parity.mjs`, `HostPort.ts`, `protocol.ts` and
`session.ts` in core. `docs/spec/` stops at `18-skills.md`. The citations
resolve to nothing.

Section numbers are load-bearing and sections are added at the end, so this is
`19-two-hosts.md` and nothing renumbers.

**Files:**
- Create: `docs/spec/19-two-hosts.md`
- Modify: `docs/spec/README.md` — add the row

**Content:** what belongs to core and what belongs to a host; the `HostPort`
surface as the entire porting surface; the sidecar's existence and why (the
engine is TypeScript, the plugin is JVM, and porting the engine to Kotlin was
the rejected alternative); the line-delimited JSON protocol; the parity check
and its exception list; and the two capabilities a JVM host cannot offer
(Agent Skills folder, assistant settings registry) with what the steps report
instead.

---

- [ ] **Step 1: Write the section** covering the above, with the decision
  record for "sidecar over a Kotlin port" and for "the sidecar owns the bridge".

- [ ] **Step 2: Add the README row.**

- [ ] **Step 3: `npm run verify`.**
