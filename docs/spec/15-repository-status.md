# 15. Repository status

> Part of the [AI Dev Workflow Phase 1 design](README.md).

The repository is under git version control. `out/` is tracked deliberately —
`package.json`'s `main` points into it, so a fresh checkout stays installable without a
build step — which means a source change is not complete until the bundles are rebuilt in
the same commit.
