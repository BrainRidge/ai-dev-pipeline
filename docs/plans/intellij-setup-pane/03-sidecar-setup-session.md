# Task 3: The sidecar's setup session

> Part of the [IntelliJ setup pane plan](README.md).

The sidecar's five methods all serve pane 2. Pane 1 needs a session of its own,
and it needs to own a `WebviewBridge<SetupDescriptor>` so that the
`ready`/flush handling lives in core rather than being written a second time in
Kotlin.

That inverts how the host talks to it. The existing methods are
request/response: the host asks, the sidecar answers. A bridge does not work
that way — it pushes a `render` when it decides to, which is exactly what
`SidecarEvent`'s `render` member is for and what `Sidecar.onEvent` is
documented to deliver. So the host's job becomes forwarding: one method,
`message`, that hands the page's message to the bridge and returns nothing.

**The transport the sidecar supplies to the bridge** posts by emitting a
`SidecarEvent`, and receives from `message`. The JVM never interprets either.

**Actions the sidecar handles:** `refresh` (re-describe with merged values),
`start` (validate, `createTask`, then report), `open` (resume). **Actions it
does not:** `browse` and `openSettings` are IDE dialogs; the sidecar emits a
`host` event naming them so the host can act.

`PROTOCOL_VERSION` is untouched: the descriptor shape the renderer sees does
not change, so bumping it would only make both hosts show the reload prompt.

**Files:**
- Modify: `tool/core/src/sidecar/protocol.ts` — `message` and `setupReady`
- Create: `tool/core/src/sidecar/setupSession.ts`
- Create: `tool/core/test/sidecar/setupSession.test.ts`
- Modify: `tool/core/src/sidecar/main.ts` — dispatch the two new methods

**Interfaces:**
- `setupReady: { params: { version: string }; result: null }` — builds the
  session, sends the first render
- `message: { params: { message: unknown }; result: null }` — forwards inward
- New event member: `host` — `{ action: 'browse' | 'openSettings', ... }`

---

- [ ] **Step 1: Write the failing test** — a `ready` in produces a `render`
  out; an `action`/`refresh` produces a second `render` with merged values; an
  `action`/`start` with an invalid selection produces a `render` carrying
  errors rather than creating anything.

- [ ] **Step 2: Add the protocol members** and the `host` event.

- [ ] **Step 3: Implement `setupSession.ts`** over `buildSetupDescriptor`
  (Task 1) and `createTask` (Task 2).

- [ ] **Step 4: Dispatch from `main.ts`.**

- [ ] **Step 5: `npm run verify`.**
