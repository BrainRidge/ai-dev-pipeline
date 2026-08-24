# Content template

Copy this folder somewhere your team owns — a small git repository is the
intended shape — then point **Content Root** at your copy:

**Settings → Extensions → AI Dev Workflow**

Setting Content Root fills in the four settings below it — Microservice
Config, Platform Config, Custom Prompts and Tool Config — so you normally set
one path and are done. Each can also be set on its own, and whatever is in it
wins: point Microservice Config at a catalogue your whole organisation shares
while Custom Prompts stays your team's.

A field you change yourself is never overwritten. Only ones that are empty, or
still hold what the extension put there, get updated when Content Root changes.

Commit the settings to a repository's `.vscode/settings.json` and everyone
working in that repository resolves the same content.

## What goes in it

    <your copy>/
    ├── config/
    │   ├── platforms.json        required
    │   ├── microservices.json    required
    │   └── tools.json            optional
    └── prompts/
        ├── <workflowId>/
        │   └── <stepId>.md       optional, per file
        └── skills/
            └── *.md              personas a workflow step opts into

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

**`tools.json` is optional and falls back as a whole.** It lists the tools the
Tool Check step looks for on a developer's machine, and if you supply none the
extension uses a default list — git, a JDK, Maven and Gradle. The step's report
says which list it used, so the fallback is never invisible. Mark a tool
`"required": true` only if a developer genuinely cannot finish the workflow
without it: a required tool that is missing stops the task there.

**`prompts/skills/` is whatever you want it to be.** Nothing looks in that folder by name —
it is where the example persona lives because a workflow step names its prompts by path:

    "prompts": ["/skills/java-expert.md", "/skills/security.md"]

Those are composed in order, ahead of the step's own template, and the panel caption lists
each one so a developer can see what shaped the prompt. See
[spec Section 6](../../docs/spec/06-workflow-schema.md).

**`workflows/` is not read.** Which steps run, and in what order, is what the
extension standardises; it is bundled and changed by release.

See [spec Section 16](../../docs/spec/16-external-content.md) for the whole
contract, and [Section 17](../../docs/spec/17-tool-check.md) for the tool
list and what the Tool Check step does with it.
