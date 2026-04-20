import { JimuMapView, JimuLayerView, MapViewManager } from 'jimu-arcgis'
import { getJimuMapViewById, extractMapConfigFromEsriMap } from './mapUtils'
import { ISourceConfig } from '../setting/configs'
import { getUnlockedSourceIds, serializeLockedForDiff } from './sourceConfigUtils'
import { createLogger } from './logger'

const logger = createLogger('MapSyncManager')

// Auto-sync layers with ESRI map - hidden config for now, always enabled
export const AUTO_SYNC_LAYERS = true

/**
 * Trailing-edge debounce window for notifyChange. Esri layer events often
 * fire in bursts (a single user toggle may emit visibility + loaded events,
 * a WebMap load fires N "created" events back-to-back, etc.) and we don't
 * want to recompute the diff and re-render every single one.
 */
const NOTIFY_DEBOUNCE_MS = 100

export interface MapSyncConfig {
  title?: string
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
  /** Tracks which map ID has already had its initial sync performed */
  private initialSyncDoneForMapId: string = ''
  
  // Bound listener references for cleanup
  private boundOnLayerCreated: ((jlv: JimuLayerView) => void) | null = null
  private boundOnLayerRemoved: ((jlv: JimuLayerView) => void) | null = null
  private boundOnVisibilityChanged: ((jlvs: JimuLayerView[]) => void) | null = null

  // Pending debounced notify timer; cleared on detach / coalesced on rapid bursts.
  private notifyTimer: ReturnType<typeof setTimeout> | null = null

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
      logger.warn('Could not attach - no map view available')
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
      logger.debug('Layer created', jimuLayerView.layer?.title)
      this.scheduleNotify()
    }

    this.boundOnLayerRemoved = (jimuLayerView: JimuLayerView) => {
      logger.debug('Layer removed', jimuLayerView.layer?.title)
      this.scheduleNotify()
    }

    this.boundOnVisibilityChanged = (jimuLayerViews: JimuLayerView[]) => {
      logger.debug('Layer visibility changed', jimuLayerViews.map(v => v.layer?.title))
      this.scheduleNotify()
    }

    // Add listeners
    jimuMapView.addJimuLayerViewCreatedListener(this.boundOnLayerCreated)
    jimuMapView.addJimuLayerViewRemovedListener(this.boundOnLayerRemoved)
    jimuMapView.addJimuLayerViewsVisibleChangeListener(this.boundOnVisibilityChanged)

    logger.debug('Attached to map', mapId)
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
      logger.debug('Detached')
    }

    this.jimuMapView = null
    this.boundOnLayerCreated = null
    this.boundOnLayerRemoved = null
    this.boundOnVisibilityChanged = null
    this.initialized = false
    this.lastConfigJson = ''
    if (this.notifyTimer !== null) {
      clearTimeout(this.notifyTimer)
      this.notifyTimer = null
    }
  }

  /**
   * Check if initial sync has already been performed for a given map ID.
   * This persists across component remounts since the manager is a singleton.
   */
  isInitialSyncDone(mapId: string): boolean {
    return this.initialSyncDoneForMapId === mapId
  }

  /**
   * Mark that the initial sync has been performed for a given map ID.
   */
  markInitialSyncDone(mapId: string): void {
    this.initialSyncDoneForMapId = mapId
  }

  /**
   * Reset the initial sync tracking, allowing a fresh sync on next attach.
   * Call this when the user toggles "Use Existing Map" off.
   */
  resetInitialSync(): void {
    this.initialSyncDoneForMapId = ''
  }

  /**
   * Get the current map configuration (center, zoom, title, sources with visibility).
   */
  getCurrentConfig(mapId: string): MapSyncConfig | null {
    const mapViewManager = MapViewManager.getInstance()
    const extracted = extractMapConfigFromEsriMap(mapId, mapViewManager)
    
    if (!extracted) {
      return null
    }

    return {
      title: extracted.title,
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

    const unlockedIds = getUnlockedSourceIds(currentConfig.sourceConfigs || [])
    return serializeLockedForDiff(currentConfig.sourceConfigs) !==
      serializeLockedForDiff(newConfig.sourceConfigs, unlockedIds)
  }

  /**
   * Schedule a debounced call to notifyChange. Multiple calls inside
   * NOTIFY_DEBOUNCE_MS coalesce into a single notification on the trailing
   * edge. Used in place of direct notifyChange() so layer-event bursts and
   * the initial-mismatch case both go through one path.
   */
  private scheduleNotify(): void {
    if (this.notifyTimer !== null) {
      clearTimeout(this.notifyTimer)
    }
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null
      this.notifyChange()
    }, NOTIFY_DEBOUNCE_MS)
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

    logger.debug('Notifying', this.changeListeners.size, 'listeners of change')
    this.changeListeners.forEach(listener => {
      try {
        listener(newConfig)
      } catch (e) {
        logger.error('Error in change listener', e)
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
      const unlockedIds = getUnlockedSourceIds(currentConfig.sourceConfigs || [])
      const hasMismatch =
        serializeLockedForDiff(currentConfig.sourceConfigs) !==
        serializeLockedForDiff(mapConfig.sourceConfigs, unlockedIds)

      this.initialized = true

      if (hasMismatch) {
        logger.debug('Initial config mismatch detected on attach')
        // Schedule notify so listeners attached after attach() still receive
        // the initial mismatch event. The debounce window also lets us
        // coalesce with any layer-created bursts that fire right after a
        // WebMap finishes loading.
        this.scheduleNotify()
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

// Per-widget instances. Each audiom widget on a page gets its own
// MapSyncManager so two widgets can't accidentally share initial-sync state,
// listeners, or debounce timers. The map is keyed by widget id and outlives
// component remounts (ExB remounts the settings panel when the user switches
// between widget settings tabs), which is what lets initial-sync tracking
// persist across remounts for the same widget.
const instances: Map<string, MapSyncManager> = new Map()

/**
 * Get (or lazily create) the MapSyncManager for a given widget id.
 *
 * Pass `props.id` from the consuming widget — both the settings panel and
 * the runtime view of a single widget should pass the same id so they share
 * an instance.
 */
export function getMapSyncManager(widgetId: string): MapSyncManager {
  let inst = instances.get(widgetId)
  if (!inst) {
    inst = new MapSyncManager()
    instances.set(widgetId, inst)
  }
  return inst
}

/**
 * Dispose the MapSyncManager for a widget. Detaches listeners and removes
 * the entry from the registry. Safe to call when no instance exists.
 */
export function disposeMapSyncManager(widgetId: string): void {
  const inst = instances.get(widgetId)
  if (inst) {
    inst.detach()
    instances.delete(widgetId)
  }
}

/**
 * React hook for using the per-widget MapSyncManager in components.
 */
export function useMapSyncManager(widgetId: string) {
  return getMapSyncManager(widgetId)
}
