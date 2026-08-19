# 13. Release and distribution

> Part of the [AI Dev Workflow Phase 1 design](README.md).

Semantic versioning. Prompt-only edits are patch releases. Because tasks snapshot their
workflow (D8), a release can never disturb work in flight.

Distribution is by `.vsix` built in CI and published to an internal artifact location, from
which developers install manually (D7).

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
