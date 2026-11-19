# Progress: host experience on iframe embeds

## Done

The plan is filed in PLAN.md. Tests cover the experience URL, the embed query, the runtime iframe, and the settings preview. Both iframe callers send `experience=https://experience.arcgis.com/experience/{itemId}` when the app id is a 32-character item id. A Developer Edition id, a missing id, or a downloaded app sends nothing. Bundled mode is unchanged.

## In progress

Nothing.

## Next

Developer review of the embed parameter.

## Blockers

None in this repository. Audiom joins the cards only after `feat/2650-experience-object-cards-draft-01` ships. Sending the parameter does not depend on that branch.
