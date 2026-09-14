# Implementation plans

| Phase | Plan | Status |
|---|---|---|
| P1 | [`p1/`](p1/README.md) | Shipped. Tasks 0–17, one file each. |
| — | [`external-content/`](external-content/README.md) | Implemented, tasks 0–7. Manual acceptance not yet walked. |
| — | [`epic-browser-fetch/`](epic-browser-fetch/README.md) | Not started. Tasks 0–8. |

`external-content/` implements [spec Section 16](../spec/16-external-content.md),
which post-dates the P1–P4 phasing in [Section 3](../spec/03-phasing.md) and
belongs to none of those phases — hence no phase number. `epic-browser-fetch/`
implements [Section 19](../spec/19-epic-browser-fetch.md) for the same reason —
including no relation to P3, which Section 19 explains.

A plan is written from the [spec](../spec/README.md) before implementation and is not
edited afterwards — it records what was built and why, at the time it was built. Where
a plan and the code now disagree, the code is right and the [spec](../spec/README.md) is
the document to correct.
