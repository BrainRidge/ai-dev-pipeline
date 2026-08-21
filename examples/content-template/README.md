# Content template

Copy this folder somewhere your team owns — a small git repository is the
intended shape — then point **Content Root** at your copy:

**Settings → Extensions → AI Dev Workflow**

Setting Content Root fills in the three settings below it — Microservice
Config, Platform Config and Custom Prompts — so you normally set one path and
are done. Each can also be set on its own, and whatever is in it wins: point
Microservice Config at a catalogue your whole organisation shares while Custom
Prompts stays your team's.

A field you change yourself is never overwritten. Only ones that are empty, or
still hold what the extension put there, get updated when Content Root changes.

Commit the settings to a repository's `.vscode/settings.json` and everyone
working in that repository resolves the same content.

## What goes in it

    <your copy>/
    ├── config/
    │   ├── platforms.json        required
    │   └── microservices.json    required
    └── prompts/
        └── <workflowId>/
            └── <stepId>.md       optional, per file

**Both config files are required and do not fall back.** Until both are present
and valid, the sidebar names the setting at fault and shows nothing else. That is deliberate:
the bundled catalogue would name repositories belonging to another team, and the
`gitClone` step would put them on your disk.

**`prompts/` is optional and falls back per file.** Any template you do not
supply uses the one shipped with the extension, so overriding a single prompt is
a one-file repository — and every prompt a later release adds still reaches you.
Name each file after the step id in the workflow, exactly: `aiHandoff.md`, not
`aiHandoff.MD`. A name differing only in case is reported as an error rather
than silently ignored.

**`workflows/` is not read.** Which steps run, and in what order, is what the
extension standardises; it is bundled and changed by release.

See [spec Section 16](../../docs/spec/16-external-content.md) for the whole
contract.
