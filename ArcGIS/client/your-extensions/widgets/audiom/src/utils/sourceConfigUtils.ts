import { ISourceConfig, IFilterConfig } from '../setting/configs'
import { SourceConfigKey } from '../setting/configKeys'

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

  // Include only map-origin filters in comparison, stripping metadata (locked/fromMap)
  // so that unlocking a filter doesn't cause a diff.
  const result: Partial<ISourceConfig> = { ...comparable }
  const comparableFilters = (source.filters || [])
    .filter(f => f.fromMap)
    .map(f => ({ expression: f.expression }))
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
 */
export function mergeFilters(currentFilters: IFilterConfig[], mapFilters: IFilterConfig[]): IFilterConfig[] {
  // Keep user-added filters (non-map filters) from current config
  const userFilters = currentFilters.filter(f => !f.fromMap)
  // Map filters are always locked (synced from map)
  const lockedMapFilters = mapFilters.map(f => ({ ...f, locked: true, fromMap: true }))
  return [...lockedMapFilters, ...userFilters]
}
