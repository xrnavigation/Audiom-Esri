/**
 * Splits widget config fields into two buckets:
 *
 *   1. RELOAD-triggering fields  → any change forces a new iframe URL,
 *      which causes the browser to reload the embed.
 *   2. POSTMESSAGE-only fields   → can be pushed live to the embed via the
 *      Audiom postMessage API without reloading.
 *
 * Today the only POSTMESSAGE-only field is the per-source `enabled` flag on
 * locked sources (visibility toggles) — see issue #55. Everything else
 * (source membership, urls, mapType, filters, center, zoom, etc.) is in the
 * RELOAD bucket because Audiom's postMessage API has no inbound command for
 * those today.
 *
 * `serializeReloadFields(config)` returns a stable JSON string keyed only on
 * RELOAD-triggering data. Use it in a useMemo dependency for `embedUrl` so
 * the iframe `src` stays stable across pure visibility deltas.
 */
import { IAudiomConfig, ISourceConfig } from '../setting/configs'

/**
 * Project a single source config down to its reload-triggering fields.
 * Drops `enabled` (postMessage-pushable) and `locked` (UI metadata).
 */
function projectSourceForReloadHash(s: ISourceConfig): Partial<ISourceConfig> {
  return {
    source: s.source,
    name: s.name,
    sourceUrl: s.sourceUrl,
    rulesFileUrl: s.rulesFileUrl,
    mapType: s.mapType,
    filters: s.filters,
    filtersLocked: s.filtersLocked,
  }
}

/**
 * Canonical JSON of every config field that, when changed, should force the
 * iframe to reload (URL change). Stable across `enabled`-only flips on
 * locked sources.
 *
 * Note: deliberately omits `useExistingMap` and `existingMapId` because
 * those control source resolution at the layer level, which is captured by
 * the resulting source list anyway. They're included here for safety so a
 * toggle of "use existing map" still recomputes the URL.
 */
export function serializeReloadFields(config: IAudiomConfig): string {
  const projected = {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    title: config.title,
    heading: config.heading,
    showHeading: config.showHeading,
    showVisualMap: config.showVisualMap,
    soundpackUrl: config.soundpackUrl,
    stepSize: config.stepSize,
    stepSizeUnit: config.stepSizeUnit,
    visualStyle: config.visualStyle,
    visualBaseLayers: config.visualBaseLayers,
    centerLatitude: config.centerLatitude,
    centerLongitude: config.centerLongitude,
    zoom: config.zoom,
    useExistingMap: config.useExistingMap,
    existingMapId: config.existingMapId,
    runtimeAutoSync: config.runtimeAutoSync,
    sourceConfigs: (config.sourceConfigs || []).map(projectSourceForReloadHash),
  }
  return JSON.stringify(projected)
}
