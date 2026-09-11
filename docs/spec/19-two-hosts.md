# 19. Two hosts, one engine

> Part of the [AI Dev Workflow design](README.md).

The workflow engine runs in two IDEs. It exists once.

That sentence is the whole of this section, and everything below is what it
costs. Twenty-odd files cite "Section 19" because almost every decision about
the JetBrains plugin is a consequence of refusing to write the engine twice.

## What belongs where

```
tool/core/          the engine, the renderer, the workflows, the prompts
tool/vscode-plugin/ a host: settings, dialogs, terminal, clipboard
tool/intellij-plugin/ a host: the same, in Kotlin
```

A workflow bug is fixed in `tool/core` and both IDEs get the fix, because
there is no second copy to forget. The plugins hold no workflow logic at all.

## The porting surface is `HostPort`

`tool/core/src/host/HostPort.ts` names everything core needs from an IDE:
clipboard and terminal (`sink`), what the editor can be asked about itself
(`environment`), prompt delivery (`handoff`), `openInEditor`, `editorVersion`
and `skills`. A second host is implemented by satisfying that interface — not
by copying the engine.

Adding a member to it is a new obligation for every host, and
`npm run check:parity` fails until both have met it.

## Why there is a sidecar

The engine is TypeScript. The JetBrains plugin is JVM code. The two cannot
share a process.

**Rejected: port the engine to Kotlin.** It would mean two engines, two sets of
workflow semantics, and two places for a bug to be fixed differently — which is
the one thing this structure exists to prevent.

**Chosen: run the engine as a child process.** The plugin spawns the bundle
built from `tool/core` and speaks line-delimited JSON over stdio. One request
per line, one response per line, UTF-8. Line-delimited rather than
`Content-Length` framed because every message is small and a developer can read
a session off the wire with `tee`.

stdout is protocol and nothing else. Anything that wants to log goes to stderr,
which the plugin forwards to the IDE log — a stray `console.log` in the sidecar
corrupts the stream and the host sees a parse error instead of the message
somebody meant to print.

The handshake (`hello`) exists so that a plugin and a bundle which disagree
fail immediately and legibly, rather than later and further away.

### The bundle has to be on disk

`RendererPanel` reads the renderer straight off the classpath, because it runs
in the plugin's own JVM. The sidecar cannot: it is a separate process, and
`AI_DEV_BUNDLED_DIR` must be a directory it can `readFile` from. So the `core/`
resources are unpacked once per plugin version into the IDE's system path.

What to unpack comes from `core/manifest.txt`, written by the Gradle build.
Enumerating the jar from inside the IDE was tried first and does not work:
under the platform's own class loader `codeSource` is null, so the unpack
failed with nothing in the log to say why.

### Finding a Node

VS Code never had to answer this — its extension host *is* Node. A JVM plugin
has to look, and it looks on `PATH` and then in the well-known locations,
because an IDE launched from the desktop does not inherit a login shell's
`PATH`.

**This is deliberately not a setting.** `check:parity` requires both plugins to
expose the same settings; VS Code has no use for a Node path, so adding it to
one side fails the gate and adding it to both puts a dead control in the VS Code
UI. When no Node is found the pane says so — it must never just be blank.

## The sidecar owns the renderer bridge

`WebviewBridge` holds the `ready`/flush handling that stops a descriptor posted
before the page is listening from being lost. Getting that wrong is what leaves
a blank panel, so it is not written twice.

The consequence is that the JVM host is a pipe:

```
JCEF page  ──JBCefJSQuery──▶ RendererPanel ──stdio──▶ sidecar
(setup.js)  ◀─executeJavaScript─           ◀──event──  WebviewBridge
```

`RendererPanel` forwards what the page says inward without reading it, and
posts `page` events back out without reading them either. It does not know what
a workflow is.

Two of the setup form's actions cannot work this way, because they are IDE
windows: the folder picker and the settings dialog. Those leave the engine as
`host` events for the plugin to carry out. Remembering the work directory is
the third, because it is a write to that IDE's own settings store.

## The page has to be themed

Core's stylesheets — `webview/style.css` for the workflow pane, `webview/setup.css`
for the setup form — are written entirely in `--vscode-*` variables. That is not
a VS Code detail that leaked: it is what makes light, dark and high-contrast all
work without a second sheet, because the webview host defines those variables
from the user's theme.

JCEF defines none of them. Every colour in the pane therefore fell back — the
declarations with a fallback to a value chosen for a dark theme, the ones
without to nothing at all — and on a dark IDE the pane was black text on black.

**Rejected: a JetBrains copy of the stylesheets.** A second copy is two places
for a rule to be added and one place to forget it, which is the duplication this
section exists to refuse. The same argument is why `setup.css` is a file in core
rather than the inline block it used to be inside the VS Code `SetupView`: an
inline block is a stylesheet only one host can load, so the JetBrains setup pane
had none of it ([Section 9](09-renderer-contract.md)).

**Chosen: the host fills the variables in.** `IdeTheme` writes a `:root` block
from `UIManager`, and `RendererPanel` puts it in the page ahead of core's
unmodified stylesheet. The contract is the same one VS Code meets; only the
source of the colours differs.

Two consequences worth naming:

- **Nothing is hardcoded to a theme.** Every value is read from the look and
  feel in use, and light-or-dark is decided from the panel background's own
  luminance rather than from a theme's name, so a third-party theme is themed
  too. The exception is the four status colours the diagram uses — the platform
  has no palette for "this step passed" — which are chosen per light and dark.
- **It is re-read, not read once.** `LafManagerListener` and
  `EditorColorsManager.TOPIC` both replace the block in the loaded page, so
  switching theme re-colours the pane without reloading the renderer and without
  discarding what the developer has typed into the form.

`color-scheme` is set in the same block. Without it Chromium draws checkboxes,
radios, select popups and scrollbars in its own light palette however the rest
of the page is coloured — the other half of the same bug.

## What a JVM host cannot do

Two capabilities have no JetBrains equivalent, and both are reported rather
than silently skipped:

- **Agent Skills.** There is no skills folder, so `skills` is `undefined` and
  the Tool Check step reports the check as unsupported ([Section 18](18-skills.md)).
- **Assistant settings.** There is no registry of assistant configuration to
  read, so `environment.setting` answers "unknown" and the step says so rather
  than claiming a check it did not make ([Section 17](17-tool-check.md)).

Handoff delivery has the same shape: no third-party plugin can put text into
JetBrains' assistant chat, so mechanism **B** — the prompt goes to the
clipboard and the developer pastes it — is the honest floor for a JVM host
([Section 8](08-ai-handoff-step.md)).

## The parity check

`scripts/check-parity.mjs` compares the five things that are genuinely
duplicated: versions, `HostPort` against `IntellijHost.kt`, commands, settings,
and the renderer protocol version. Structure handles the rest — there is one
engine, one renderer, one set of workflows.

Where a difference is deliberate, because an IDE genuinely cannot offer
something, it is named here and added to the script's exception list. The
current exception is `handoff`, which the sidecar's own ladder answers rather
than the JVM host.

## Status

Pane 1 (Task SetUp) runs in both IDEs from the same descriptor builder and the
same task creation. Pane 2 (the workflow stepper) is VS Code-only, and needs
two things it does not yet have: `TaskSession`'s orchestration lifted into
core, and a sidecar→host request direction so the engine can reach
`IntellijHost` for the clipboard, the terminal and `openInEditor`. Until that
exists those members are stubbed as explicit failures in
`sidecar/session.ts` — a silent no-op in a handoff step looks exactly like a
working handoff that delivered nothing.
