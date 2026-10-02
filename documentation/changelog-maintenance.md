# Audiom changelog contributions

This component participates in the [Audiom-wide changelog](https://github.com/Coughlan-Lab/Audiom-Front-End/blob/master/CHANGELOG.md).
The [canonical procedure](https://github.com/Coughlan-Lab/Audiom-Front-End/blob/master/documentation/changelog-maintenance.md)
describes historical evidence, product release consolidation, publication and recovery.

Add a new `.changelog/<id>.json` alongside each behavior, API, dependency or
operational change. Use a stable lowercase ID, a category (Added, Changed,
Deprecated, Removed, Fixed or Security) and a concrete summary of the outcome.
Optional `details` provide technical context. Breaking changes need
`"breaking": true` and a `migration` string. Internal work needs
`"kind": "internal"` and a specific `reason`.

Examples:

```json
{"id":"loader-retry","category":"Fixed","summary":"Retry temporary source failures without losing the current map."}
```

```json
{"id":"build-cleanup","kind":"internal","reason":"Simplify build diagnostics without changing shipped behavior."}
```

Validate with `node scripts/check-changelog-note.mjs <base-sha> HEAD`. The independent
Changelog notes workflow checks PRs. Do not reuse or delete old fragment IDs,
predict merge SHAs, or satisfy the gate by editing unrelated historical prose.
There are no author/bot exemptions. Direct commits need authored notes too.

The frontend-owned reconciler follows this repository's actual source graph,
including direct commits and missed events. It records source dates without
claiming verified production deployment. The hub's scheduled collection uses a
read-only credential for private frontend, backend and Layerloader repositories.
The Audiom server exposes the private feed through its public `/api/changelog`
endpoint without sending credentials to visitors. Optional immediate dispatch
requires a GitHub App/token allowed to dispatch to Audiom-Front-End; an ordinary
repository-scoped GITHUB_TOKEN is insufficient.

This source checker is shared byte-for-byte with the frontend's
`scripts/check-changelog-note.mjs`. Keep its validation contract in sync when
changing the protocol; run the hub's behavioral tests and verify the copy.
