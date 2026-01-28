import { ISourceConfig } from '../setting/configs'
import { SourceConfigKey } from '../setting/configKeys'

/**
 * User-controlled properties are preserved during sync and excluded from change detection.
 * Uses destructuring for clean property removal.
 */
export function stripUserControlledProperties(source: ISourceConfig): Partial<ISourceConfig> {
  const {
    [SourceConfigKey.MapType]: _mapType,
    [SourceConfigKey.RulesFileUrl]: _rulesFileUrl,
    [SourceConfigKey.Enabled]: _enabled,
    [SourceConfigKey.Locked]: _locked,
    ...comparable
  } = source
  return comparable
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
    }
    
    // For unlocked sources, also preserve enabled and locked state
    if (unlocked) {
      merged.enabled = unlocked.enabled
      merged.locked = unlocked.locked
    }
    
    return merged
  })
}
