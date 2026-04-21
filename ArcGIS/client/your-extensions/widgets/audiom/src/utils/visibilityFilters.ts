/**
 * Translate widget source configs into an Audiom `setFilters` payload.
 *
 * Heuristic: the Audiom `setFilters` inbound command filters by feature
 * *type*. We map ESRI source names → feature type filters. This works only
 * when the Audiom source's emitted feature `type` matches its source name
 * (or `name`). If it doesn't, the filter silently no-ops for that source.
 * Callers should document this limitation in user-facing UI.
 *
 * Locked sources participate in visibility sync; unlocked sources are
 * manually controlled by the user and are excluded here so we don't fight
 * with their explicit choices.
 */
import { ISourceConfig } from '../setting/configs'
import { ISetFiltersPayload } from '../../../../shared/audiom-client/AudiomMessages'

/**
 * Pick the identifier we hand to Audiom's `setFilters`. Prefer the
 * `source` slug (what Audiom uses as the feature `type` key in many
 * built-in datasets), falling back to `name` for user-defined sources.
 */
function getFilterId(s: ISourceConfig): string | undefined {
  return s.source || s.name || undefined
}

/**
 * Build the Audiom `setFilters` payload representing the *currently visible*
 * locked sources. Both `global` and `scan` are populated with the same list
 * so the displayed map and sonar scan stay consistent.
 *
 * Returns `{ global: [], scan: [] }` if no locked sources qualify — Audiom
 * interprets an empty list as "show nothing" for that channel, which
 * matches the user's intent when they have toggled all layers off.
 */
export function computeVisibilityFilters(
  sources: ISourceConfig[] | undefined
): ISetFiltersPayload {
  const ids: string[] = []
  for (const s of sources || []) {
    if (s.locked === false) continue
    if (s.enabled === false) continue
    const id = getFilterId(s)
    if (id) ids.push(id)
  }
  return { global: ids, scan: ids }
}
