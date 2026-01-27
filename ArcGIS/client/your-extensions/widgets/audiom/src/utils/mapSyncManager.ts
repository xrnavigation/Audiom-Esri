import { JimuMapView, JimuLayerView, MapViewManager } from 'jimu-arcgis'
import { getJimuMapViewById, extractMapConfigFromEsriMap } from './maputils'
import { ISourceConfig } from '../setting/configs'
import { getLockedSources, getUnlockedSourceIds, excludeSourcesByIds } from './sourceConfigUtils'

// Auto-sync layers with ESRI map - hidden config for now, always enabled
export const AUTO_SYNC_LAYERS = true

export interface MapSyncConfig {
  centerLatitude?: number
  centerLongitude?: number
  zoom?: number
  sourceConfigs?: ISourceConfig[]
}

export type MapSyncChangeListener = (newConfig: MapSyncConfig) => void

/**
 * Manages synchronization between ESRI map layers and Audiom configuration.
 * Can be used by both the settings panel (to persist changes) and the widget (to detect changes).
 */
export class MapSyncManager {
  private jimuMapView: JimuMapView | null = null
  private changeListeners: Set<MapSyncChangeListener> = new Set()
  private lastConfigJson: string = ''
  private initialized: boolean = false
  
  // Bound listener references for cleanup
  private boundOnLayerCreated: ((jlv: JimuLayerView) => void) | null = null
  private boundOnLayerRemoved: ((jlv: JimuLayerView) => void) | null = null
  private boundOnVisibilityChanged: ((jlvs: JimuLayerView[]) => void) | null = null

  /**
   * Initialize the sync manager with a map widget ID.
   * Sets up layer watchers if AUTO_SYNC_LAYERS is enabled.
   * @param mapId - The map widget ID to attach to
   * @param currentConfig - Optional current widget config to compare against for initial mismatch detection
   */
  attach(mapId: string, currentConfig?: { sourceConfigs?: ISourceConfig[] }): boolean {
    const mapViewManager = MapViewManager.getInstance()
    const jimuMapView = getJimuMapViewById(mapId, mapViewManager)

    if (!jimuMapView || !jimuMapView.view) {
      console.warn('MapSyncManager: Could not attach - no map view available')
      return false
    }

    // Detach from previous view if any
    this.detach()

    this.jimuMapView = jimuMapView
    this.initialized = false

    // Initialize baseline config and check for mismatches
    this.initializeBaselineConfig(mapId, currentConfig)

    if (!AUTO_SYNC_LAYERS) {
      return true
    }

    // Create bound listener functions
    this.boundOnLayerCreated = (jimuLayerView: JimuLayerView) => {
      console.log('MapSyncManager: Layer created', jimuLayerView.layer?.title)
      this.notifyChange()
    }

    this.boundOnLayerRemoved = (jimuLayerView: JimuLayerView) => {
      console.log('MapSyncManager: Layer removed', jimuLayerView.layer?.title)
      this.notifyChange()
    }

    this.boundOnVisibilityChanged = (jimuLayerViews: JimuLayerView[]) => {
      console.log('MapSyncManager: Layer visibility changed', jimuLayerViews.map(v => v.layer?.title))
      this.notifyChange()
    }

    // Add listeners
    jimuMapView.addJimuLayerViewCreatedListener(this.boundOnLayerCreated)
    jimuMapView.addJimuLayerViewRemovedListener(this.boundOnLayerRemoved)
    jimuMapView.addJimuLayerViewsVisibleChangeListener(this.boundOnVisibilityChanged)

    console.log('MapSyncManager: Attached to map', mapId)
    return true
  }

  /**
   * Detach from the current map view and remove all listeners.
   */
  detach(): void {
    if (this.jimuMapView) {
      if (this.boundOnLayerCreated) {
        this.jimuMapView.removeJimuLayerViewCreatedListener(this.boundOnLayerCreated)
      }
      if (this.boundOnLayerRemoved) {
        this.jimuMapView.removeJimuLayerViewRemovedListener(this.boundOnLayerRemoved)
      }
      if (this.boundOnVisibilityChanged) {
        this.jimuMapView.removeJimuLayerViewsVisibleChangeListener(this.boundOnVisibilityChanged)
      }
      console.log('MapSyncManager: Detached')
    }

    this.jimuMapView = null
    this.boundOnLayerCreated = null
    this.boundOnLayerRemoved = null
    this.boundOnVisibilityChanged = null
    this.initialized = false
    this.lastConfigJson = ''
  }

  /**
   * Get the current map configuration (center, zoom, sources with visibility).
   */
  getCurrentConfig(mapId: string): MapSyncConfig | null {
    const mapViewManager = MapViewManager.getInstance()
    const extracted = extractMapConfigFromEsriMap(mapId, mapViewManager)
    
    if (!extracted) {
      return null
    }

    return {
      centerLatitude: extracted.centerLatitude,
      centerLongitude: extracted.centerLongitude,
      zoom: extracted.zoom,
      sourceConfigs: extracted.sourceConfigs as ISourceConfig[]
    }
  }

  /**
   * Add a listener that will be called when map layers change.
   */
  addChangeListener(listener: MapSyncChangeListener): void {
    this.changeListeners.add(listener)
  }

  /**
   * Remove a change listener.
   */
  removeChangeListener(listener: MapSyncChangeListener): void {
    this.changeListeners.delete(listener)
  }

  /**
   * Check if the current map config differs from the provided config.
   * Excludes unlocked sources from comparison (they are manually controlled).
   */
  hasChanges(mapId: string, currentConfig: { sourceConfigs?: ISourceConfig[] }): boolean {
    if (!this.initialized) {
      return false
    }

    const newConfig = this.getCurrentConfig(mapId)
    if (!newConfig) return false

    // Get IDs of unlocked sources from current config
    const unlockedIds = getUnlockedSourceIds(currentConfig.sourceConfigs || [])

    // Filter to only compare locked sources
    const lockedCurrentSources = getLockedSources(currentConfig.sourceConfigs || [])
    const lockedNewSources = excludeSourcesByIds(newConfig.sourceConfigs || [], unlockedIds)

    const currentJson = JSON.stringify(lockedCurrentSources)
    const newJson = JSON.stringify(lockedNewSources)

    return currentJson !== newJson
  }

  /**
   * Notify all listeners of a change.
   */
  private notifyChange(): void {
    if (!this.jimuMapView) return

    // Get the map ID from the jimuMapView
    const mapId = this.jimuMapView.mapWidgetId
    const newConfig = this.getCurrentConfig(mapId)

    if (!newConfig) return

    // Check if config actually changed
    const newJson = JSON.stringify(newConfig)
    if (newJson === this.lastConfigJson) {
      return
    }
    this.lastConfigJson = newJson

    console.log('MapSyncManager: Notifying', this.changeListeners.size, 'listeners of change')
    this.changeListeners.forEach(listener => {
      try {
        listener(newConfig)
      } catch (e) {
        console.error('MapSyncManager: Error in change listener', e)
      }
    })
  }

  /**
   * Initialize the baseline config and check for initial mismatch.
   * Excludes unlocked sources from comparison.
   * @param mapId - The map widget ID
   * @param currentConfig - Optional current widget config to compare against
   */
  private initializeBaselineConfig(mapId: string, currentConfig?: { sourceConfigs?: ISourceConfig[] }): void {
    const mapConfig = this.getCurrentConfig(mapId)
    if (!mapConfig) return

    const mapConfigJson = JSON.stringify(mapConfig.sourceConfigs || [])
    
    // Check for initial mismatch if current config provided
    if (currentConfig) {
      // Get IDs of unlocked sources from current config
      const unlockedIds = getUnlockedSourceIds(currentConfig.sourceConfigs || [])
      
      // Filter to only compare locked sources
      const lockedCurrentSources = getLockedSources(currentConfig.sourceConfigs || [])
      const lockedMapSources = excludeSourcesByIds(mapConfig.sourceConfigs || [], unlockedIds)
      
      const currentConfigJson = JSON.stringify(lockedCurrentSources)
      const mapLockedJson = JSON.stringify(lockedMapSources)
      const hasMismatch = currentConfigJson !== mapLockedJson
      
      this.initialized = true
      
      if (hasMismatch) {
        console.log('MapSyncManager: Initial config mismatch detected on attach')
        // Defer notification to next tick to allow listeners to be added
        setTimeout(() => this.notifyChange(), 0)
      } else {
        // Configs match, store baseline
        this.lastConfigJson = mapConfigJson
      }
    } else {
      // No current config provided, just store the map config
      this.lastConfigJson = mapConfigJson
      this.initialized = true
    }
  }
}

// Singleton instance for sharing between settings and widget
let sharedInstance: MapSyncManager | null = null

export function getMapSyncManager(): MapSyncManager {
  if (!sharedInstance) {
    sharedInstance = new MapSyncManager()
  }
  return sharedInstance
}

/**
 * React hook for using the MapSyncManager in components.
 * Returns the manager instance and a function to force re-render on changes.
 */
export function useMapSyncManager() {
  return getMapSyncManager()
}
