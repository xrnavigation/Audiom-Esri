import { ISourceConfig, IFilterConfig } from '../setting/configs'
import { SourceConfigKey } from '../setting/configKeys'

/**
 * Return a new array with the element at `index` shallow-merged with `patch`.
 * Used to immutably update a single item in lists like sourceConfigs/filters/layers.
 */
export function replaceAt<T>(arr: T[], index: number, patch: Partial<T>): T[] {
  const next = arr.slice()
  next[index] = { ...next[index], ...patch }
  return next
}

/**
 * Canonical JSON serialization of locked sources for change detection.
 *
 * - Only sources with `locked !== false` are included.
 * - User-controlled properties are stripped via stripUserControlledProperties.
 * - Map-origin filters are compared via their original mapExpression so
 *   user filter edits don't trigger a false-positive map change.
 * - When `excludeSourceIds` is provided (e.g., the IDs of sources the
 *   widget has manually unlocked), those sources are also excluded.
 *   This is used asymmetrically: pass the widget config's unlocked IDs
 *   when diffing freshly-extracted map sources, so an unlocked source
 *   on the widget side doesn't cause map-side changes to register.
 */
export function serializeLockedForDiff(
  sources: ISourceConfig[] | undefined,
  excludeSourceIds?: Set<string>
): string {
  let filtered = (sources || []).filter(s => s.locked !== false)
  if (excludeSourceIds && excludeSourceIds.size > 0) {
    filtered = filtered.filter(s => !excludeSourceIds.has(s.source || ''))
  }
  return JSON.stringify(filtered.map(stripUserControlledProperties))
}

/**
 * Strip properties that shouldn't be compared for change detection on locked sources.
 * Only used on locked sources (unlocked sources are excluded from comparison entirely).
 * - mapType/rulesFileUrl: user-editable, preserved during sync
 * - locked: metadata, not relevant to change detection
 * - enabled: KEPT for locked sources to detect visibility changes from the map
 * - filters: only locked filters are included in comparison
 */
export function stripUserControlledProperties(source: ISourceConfig): Partial<ISourceConfig> {
  const {
    [SourceConfigKey.MapType]: _mapType,
    [SourceConfigKey.RulesFileUrl]: _rulesFileUrl,
    [SourceConfigKey.Locked]: _locked,
    [SourceConfigKey.Filters]: _filters,
    [SourceConfigKey.FiltersLocked]: _filtersLocked,
    ...comparable
  } = source

  // Include ALL map-origin filters in comparison using their original map values.
  // This ensures unlocking/editing a filter doesn't cause a diff (user edits change
  // 'expression' but not 'mapExpression'). Only actual map changes cause a diff.
  const result: Partial<ISourceConfig> = { ...comparable }
  const comparableFilters = (source.filters || [])
    .filter(f => f.fromMap)
    .map(f => ({ expression: f.mapExpression ?? f.expression }))
  if (comparableFilters.length > 0) {
    result.filters = comparableFilters as IFilterConfig[]
  }
  return result
}

/**
 * Filter sources to only include locked sources (sources that sync with the map).
 * A source is considered locked if locked !== false (i.e., true or undefined).
 */
export function getLockedSources(sources: ISourceConfig[]): ISourceConfig[] {
  return sources.filter(s => s.locked !== false)
}

/**
 * Filter sources to only include unlocked sources (manually controlled).
 */
export function getUnlockedSources(sources: ISourceConfig[]): ISourceConfig[] {
  return sources.filter(s => s.locked === false)
}

/**
 * Build a map of unlocked sources keyed by their source identifier.
 */
export function buildUnlockedSourcesMap(sources: ISourceConfig[]): Map<string, ISourceConfig> {
  const unlockedMap = new Map<string, ISourceConfig>()
  sources.forEach(s => {
    if (s.locked === false && s.source) {
      unlockedMap.set(s.source, s)
    }
  })
  return unlockedMap
}

/**
 * Get the set of source identifiers that are unlocked.
 */
export function getUnlockedSourceIds(sources: ISourceConfig[]): Set<string> {
  const ids = new Set<string>()
  sources.forEach(s => {
    if (s.locked === false && s.source) {
      ids.add(s.source)
    }
  })
  return ids
}

/**
 * Filter sources by excluding those with source IDs in the given set.
 */
export function excludeSourcesByIds(sources: ISourceConfig[], excludeIds: Set<string>): ISourceConfig[] {
  return sources.filter(s => !excludeIds.has(s.source || ''))
}

/**
 * Merge map sources with current config, preserving user-configurable properties.
 * - enabled/locked: preserved only for unlocked sources
 * - mapType/rulesFileUrl: always preserved from current config (user-editable)
 * @param currentSources - The current widget config sources
 * @param mapSources - Fresh sources from the map
 * @returns Merged sources with user properties preserved
 */
export function mergeSourcesPreservingUnlocked(
  currentSources: ISourceConfig[],
  mapSources: ISourceConfig[]
): ISourceConfig[] {
  const unlockedMap = buildUnlockedSourcesMap(currentSources)
  
  // Build a map of current sources for preserving user-editable properties
  const currentSourceMap = new Map<string, ISourceConfig>()
  currentSources.forEach(s => {
    if (s.source) {
      currentSourceMap.set(s.source, s)
    }
  })
  
  return mapSources.map(mapSource => {
    const sourceId = mapSource.source || ''
    const current = currentSourceMap.get(sourceId)
    const unlocked = unlockedMap.get(sourceId)
    
    // Start with map source as base
    let merged = { ...mapSource }
    
    // Always preserve user-editable properties from current config
    if (current) {
      merged.mapType = current.mapType ?? mapSource.mapType
      merged.rulesFileUrl = current.rulesFileUrl ?? mapSource.rulesFileUrl
      merged.filtersLocked = current.filtersLocked
      // Merge filters: when filtersLocked, use only map filters; otherwise keep user-unlocked filters too
      if (current.filtersLocked === false) {
        merged.filters = mergeFilters(current.filters || [], mapSource.filters || [])
      } else {
        merged.filters = mapSource.filters || []
      }
    }
    
    // For unlocked sources, also preserve enabled and locked state
    if (unlocked) {
      merged.enabled = unlocked.enabled
      merged.locked = unlocked.locked
    }
    
    return merged
  })
}

/**
 * Merge filter lists during map sync.
 * - Locked filters are replaced with fresh map filters
 * - Unlocked (user-controlled) filters are preserved
 *
 * NOTE on ordering: the result is always
 *   [ ...freshLockedMapFilters, ...preservedUnlockedMapFilters, ...userAddedFilters ]
 * regardless of how the user originally interleaved them. This means a sync
 * pass can visibly reorder filters in the settings UI (e.g. an unlocked
 * map filter that the user dragged above a locked one will jump back below
 * after the next sync). This is intentional for now — the bucket order
 * is more predictable than trying to preserve interleaved positions while
 * inserting newly-added map filters. If we later need stable ordering, the
 * fix is to track each map-origin filter's original index and merge by it.
 */
export function mergeFilters(currentFilters: IFilterConfig[], mapFilters: IFilterConfig[]): IFilterConfig[] {
  // Keep user-added filters (non-map filters) from current config
  const userFilters = currentFilters.filter(f => !f.fromMap)
  // Keep unlocked map-origin filters, updating their mapExpression/mapFilterType from fresh map data
  const unlockedMapFilters = currentFilters.filter(f => f.fromMap && f.locked === false)
  // Locked map filters are replaced with fresh values from the map
  const lockedMapFilters = mapFilters.map(f => ({
    ...f, locked: true, fromMap: true,
    mapExpression: f.expression, mapFilterType: f.filterType
  }))
  return [...lockedMapFilters, ...unlockedMapFilters, ...userFilters]
}
