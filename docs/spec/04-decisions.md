# 4. Decisions

> Part of the [AI Dev Workflow Phase 1 design](README.md).

These were settled during brainstorming and are not open for reinterpretation during
implementation. Changing one is a spec change.

| # | Decision | Rationale |
|---|---|---|
| D1 | **The extension orchestrates; Copilot agent mode executes.** The extension gathers context and composes prompts, then hands off to Copilot Chat, which performs the model work and all file edits. | Far less to build; leverages Copilot's editing loop, which a direct API call cannot match. Accepted cost: the in-chat conversation is not auditable. |
| D2 | **Workflow definitions are bundled in the extension repo** as JSON, shipped with each release, changed by pull request. | Strongest standardisation; satisfies "developers can change, users cannot"; no runtime config machinery. Accepted cost: a workflow tweak requires an extension release. |
| D3 | **Multi-root workspace.** The extension authors a `.code-workspace` file containing the task's repos plus its artifact folder. | Matches how the team already works; one extension instance sees every relevant repo. |
| D4 | **Artifacts and run state live in a per-task folder outside all repos**, mounted as an extra workspace root. | Repos stay clean; artifacts remain visible to Copilot and editable in the editor; state survives reloads. Accepted cost: artifacts are local-only. |
| D5 | **External data arrives by manual paste, behind a provider interface.** | Nothing to get approved; works on day one; MCP later becomes a new provider implementation with no workflow changes. |
| D6 | **Declarative engine plus generic renderer.** Workflows are JSON; the webview renders step descriptors and knows no workflow names. | Adding or changing a workflow never touches TypeScript or HTML. Best fit for a Java team and for the MCP migration. |
| D7 | **Distribution is `.vsix` installed from an internal artifact location.** No Azure DevOps gallery. | Confirmed as the only acceptable option. Accepted cost: no auto-update; version drift is mitigated but not solved by a startup version check. |
| D8 | **Each task snapshots its workflow definition at start.** | A task runs the definition it began with, immune to extension updates mid-flight. Accepted cost: workflow fixes do not reach in-flight tasks. |
| D9 | **A handoff step completes only when the output file exists *and* the developer confirms.** | Neither signal alone is trustworthy. Accepted cost: slightly more friction, explicitly agreed. |

## Where implementation departed from these

Five departures, recorded here because a decision table that quietly disagrees with the code
is worse than no decision table.

**D2 and D6 — the format is JSON, not YAML.** Both decisions originally said YAML. The
substance of each — bundled, versioned, changed by pull request, no TypeScript to add a
workflow — is unaffected. JSON was chosen during implementation because the schema is
validated with zod either way and JSON needs no parser at the boundary. Prompt templates are
markdown with YAML frontmatter, so the YAML dependency remains, for that.

**D5 — the provider seam is now referenced, and shallow.** For a while `ProviderRegistry` and
`ManualProvider` existed in `src/providers/` and nothing imported them, which made the seam a
design intention rather than an indirection. `CollectRequirement` now resolves its story
field's `provider` key through the registry on every render, and a test proves that a provider
returning options turns that field into a selection with no other change anywhere. So the
substance of D5 holds: P3 adds an implementation and a name, not a mechanism.

What is still untested is a provider that does real I/O. `ManualProvider` cannot fail, cannot
be slow and needs no credentials, so P3 still owns every question about latency, error
handling and authentication — it simply no longer owns the seam itself.

**D9 — weakened for handoffs that produce edits rather than a file.** A step contracted to
write an artifact still requires both signals. `invokeCopilotCoding` and
`invokeCopilotCodeReview` produce edits to repositories, so there is no file to watch for and
completion rests on the developer's word alone. The prompt is still composed deterministically
and logged in full before it leaves, so the audit trail still answers what was asked; it no
longer independently corroborates that anything was done. See
[Section 8](08-ai-handoff-step.md).

**D3 and D4 — the workspace is generated only when it buys something.** If every repository
in scope is already inside a folder open in the current window, no `.code-workspace` is
written and no reload is offered. The developer is already working the way the generated
workspace would have arranged for, and reloading a correctly configured window costs the
extension host restart for nothing.

**D2 — config and prompts are no longer bundled.** Workflow definitions still are: they
remain in the extension repository, changed by pull request and release, which is the part of
D2 that standardises the process. The platform and microservice catalogues and the prompt
templates now come from paths a team maintains, behind the `aiDevWorkflow.microserviceConfig`,
`aiDevWorkflow.platformConfig` and `aiDevWorkflow.customPrompts` settings — with
`aiDevWorkflow.contentRoot` as the convenience that fills all three in — because one build
otherwise serves exactly one team. Accepted cost: the team owning
the extension no longer knows what any given team's prompts say. See
[Section 16](16-external-content.md).
