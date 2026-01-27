import { ISourceConfig } from '../setting/configs'

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
 * Merge map sources with current config, preserving enabled/locked state for unlocked sources.
 * @param currentSources - The current widget config sources
 * @param mapSources - Fresh sources from the map
 * @returns Merged sources with unlocked items preserving their state
 */
export function mergeSourcesPreservingUnlocked(
  currentSources: ISourceConfig[],
  mapSources: ISourceConfig[]
): ISourceConfig[] {
  const unlockedMap = buildUnlockedSourcesMap(currentSources)
  
  return mapSources.map(mapSource => {
    const unlocked = unlockedMap.get(mapSource.source || '')
    if (unlocked) {
      // Preserve the unlocked source's enabled and locked state
      return { ...mapSource, enabled: unlocked.enabled, locked: unlocked.locked }
    }
    return mapSource
  })
}
