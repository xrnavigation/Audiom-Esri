import { type AllWidgetProps, React, ReactRedux, AppMode, getAppStore, loadArcGISJSAPIModules, type IMState, type ImmutableObject } from 'jimu-core'
import { audiomConfigToEmbedConfig } from '../utils/mapUtils'
import { getMapSyncManager, AUTO_SYNC_LAYERS } from '../utils/mapSyncManager'
import { serializeLockedForDiff } from '../utils/sourceConfigUtils'
import { JimuMapView, JimuMapViewComponent } from 'jimu-arcgis'
import { DEFAULT_CONFIG, IAudiomConfig, toMutableConfig } from '../setting/configs'
import { sanitizeConfig, useLogWarnings as logWarnings } from '../setting/validation/validation'
import {
  isIntegratedRuntime,
  RuntimeLocation,
  runtimeLocationOf
} from '../setting/runtimeLocation'
import MessagePopup, { MessageType } from './components/MessagePopup'
import { JimuConfig } from '../utils/JimuConfig'

import { bundledFocusTarget, bundledStatus, paintAudiomStyles, primeBundledAudio, restoreAudiomStyles, startBundledRuntime, unlockBundledAudio, type BundledRuntimeHandle } from './bundledRuntime'
import { VectorStyleMode } from './audiomSymbols'
import { snapshotFeaturesFromMapView, type SnapshotMapTypeHint } from './mapSnapshot'
import { resolveSoundpackFallbackUrl, resolveSoundpackUrl } from './soundpackUrl'
import type { MapSnapshot } from '../../../../shared/audiom-runtime/src/types'
import { StepSize, StepSizeUnit } from '../../../../shared/audiom-client/StepSize'
import {
  avatarScreenPoint,
  destroyMapSurface,
  featureDetails,
  featureScreenPoint,
  mapPointFromScreen,
  renderedGraphic,
  mountEsriMap,
  showAvatar,
  type FeatureClickPoint,
  type MountedMapSurface
} from './esriMapSurface'
import type { ReportedAvatar } from './reportedAvatar'

const { useState, useEffect, useRef } = React

/** Audiom feature name + "statistic: value" at a point, read from the world. */
function audiomPopupLines (world: unknown, longitude: number, latitude: number): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const compiled = require('../../../../../../../../Audiom-Front-End/src/runtime/exbEntry') as {
      popupContentAt?: (world: unknown, longitude: number, latitude: number) => string[]
    }
    return compiled.popupContentAt?.(world, longitude, latitude) ?? []
  } catch {
    return []
  }
}

/**
 * Indoor and Travel name the plot. The statistic line is heatmap content,
 * and it is also content a rules file adds. With no rules file those modes
 * show the name only.
 */
function includeStatistic (
  world: unknown,
  sources: ReadonlyArray<{ mapType?: string, rulesFileUrl?: string }> | undefined
): boolean {
  const typed = (sources || []).filter((source) => source.mapType)
  if (!typed.length) return true
  return typed.some((source) => {
    const mode = source.mapType === 'standard' ? 'travel' : source.mapType
    if (mode === 'heatmap') return true
    return Boolean(source.rulesFileUrl?.trim())
  })
}

/** The selected statistic as "label: value", read from the clicked graphic. */
function statisticLine (world: unknown, point: FeatureClickPoint): string {
  const stats = (world as { statistics?: { field?: string, label?: string } } | null | undefined)?.statistics
  const field = stats?.field
  const value = field && point.attributes ? point.attributes[field] : undefined
  if (typeof value !== 'number') return ''
  const shown = Number.isInteger(value) ? value : Number(value.toFixed(2))
  return `${stats?.label ?? field}: ${shown}`
}

/** Replay a wheel event on the Esri view so zoom works over Audiom overlays. */
function replayWheelToMap (event: React.WheelEvent<HTMLElement>): void {
  const map = document.getElementById('audiom-esri-map')
  const view = map?.querySelector('.esri-view-surface')
  if (!(view instanceof HTMLElement)) return
  event.preventDefault()
  view.dispatchEvent(new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    clientX: event.clientX,
    clientY: event.clientY,
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaMode: event.deltaMode,
    ctrlKey: event.ctrlKey
  }))
}



const PAINT_STYLE_MODES = new Set<string>(Object.values(VectorStyleMode))

/**
 * The legend writes vectorStyleMode on the singleton the menus inject.
 * The session world keeps a copy of that store only when it was constructed
 * with it. Read the injected store first so a toggle is the mode that paints.
 */
function paintStyleMode (
  program: {
    world?: {
      settings?: { vectorStyleMode?: VectorStyleMode }
      rootStore?: { settings?: { vectorStyleMode?: VectorStyleMode } }
    }
  } | null
): VectorStyleMode {
  const world = program?.world
  const mode = world?.rootStore?.settings?.vectorStyleMode
    || world?.settings?.vectorStyleMode
  return mode && PAINT_STYLE_MODES.has(mode) ? mode : VectorStyleMode.Colors
}

function numericFieldType (type: string | undefined): boolean {
  const key = (type || '').toLowerCase()
  return key.includes('integer') || key.includes('double') || key.includes('single') ||
    key.includes('float') || key === 'number' || key === 'oid' ||
    key === 'small-integer' || key === 'long'
}

/** Same exclusions as the legend dropdown. Codes and labels are not statistics. */
function isMeasureField (field: string): boolean {
  const key = field.toLowerCase()
  if (
    key === 'objectid' || key === 'fid' || key === 'audiomstyle' || key === 'id' ||
    key === 'name' || key === 'state' || key === 'updated' || key === 'ruletype' ||
    key === 'rulename' || key === 'level' || key === 'origid'
  ) return false
  if (
    key === 'shape__length' || key === 'shape__area' || key === 'shape_length' ||
    key === 'shape_area' || key === 'st_area(shape)' || key === 'st_length(shape)' ||
    key.endsWith('_length') || key.endsWith('_area')
  ) return false
  if (key.startsWith('label') || key.includes('zip') || key.endsWith('code') || key.endsWith('_id')) {
    return false
  }
  return true
}

function columnVaries (
  features: Array<{ attributes?: Record<string, unknown> }> | undefined,
  field: string
): boolean {
  let seen: number | undefined
  for (const feature of features || []) {
    const value = feature.attributes?.[field]
    const parsed = typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() ? Number(value) : NaN
    if (!Number.isFinite(parsed)) continue
    if (seen !== undefined && seen !== parsed) return true
    seen = parsed
  }
  return false
}

/**
 * Statistics the legend dropdown lists: numeric service fields that vary,
 * in service order. The first of these is ramp 0.
 */
function catalogFields (
  layers: Array<{
    fields?: Array<{ name?: string, type?: string }>
    features?: Array<{ attributes?: Record<string, unknown> }>
  }> | undefined
): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const layer of layers || []) {
    for (const field of layer.fields || []) {
      const name = field.name
      if (!name || seen.has(name) || !numericFieldType(field.type) || !isMeasureField(name)) continue
      if (!columnVaries(layer.features, name)) continue
      seen.add(name)
      names.push(name)
    }
  }
  return names
}



// Typed styles with full key/value validation
const styles = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100%'
  },
  iframe: {
    border: 0,
    width: '100%',
    height: '100%'
  },
  mapSourcePrompt: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    margin: 0,
    padding: '16px',
    textAlign: 'center',
    lineHeight: 1.4
  }
} as const satisfies Record<string, React.CSSProperties>

/** Shown until bundled mode has a web map or web scene to load. */
const SET_MAP_SOURCE_MESSAGE = 'Set a map source first.'

/**
 * The web map item lives on the data source portal, not the app portal.
 * Loading it without that URL is the CONT_0001 "item does not exist" error,
 * which leaves the map with no feature layers.
 */
type MapSourceJson = { itemId?: string, portalUrl?: string } | null | undefined

function dataSourcesFromState (): Record<string, MapSourceJson> {
  const state = getAppStore().getState() as {
    appConfig?: { dataSources?: Record<string, MapSourceJson> }
    appStateInBuilder?: { appConfig?: { dataSources?: Record<string, MapSourceJson> } }
  }
  return {
    ...(state.appConfig?.dataSources || {}),
    ...(state.appStateInBuilder?.appConfig?.dataSources || {})
  }
}

/** The web map or web scene the selector is currently connected to. */
function selectedMapItemId (
  props: AllWidgetProps<ImmutableObject<IAudiomConfig>>,
  savedItemId: string | undefined
): string {
  const sources = props.useDataSources
  // An explicit empty connection means the source was removed. A missing
  // prop means this render only has the saved item id.
  if (sources && sources.length === 0) return ''
  const connected = sources ? Array.from(sources) : []
  const dataSources = dataSourcesFromState()
  for (const source of connected) {
    const id = source.mainDataSourceId || source.dataSourceId
    const itemId = id ? dataSources[id]?.itemId : undefined
    if (itemId) return itemId
  }
  return savedItemId || ''
}

function portalUrlForItem (
  props: AllWidgetProps<ImmutableObject<IAudiomConfig>>,
  itemId: string | undefined
): string | undefined {
  if (!itemId) return undefined
  const sources = props.useDataSources ? Array.from(props.useDataSources) : []
  const dataSources = dataSourcesFromState()
  for (const source of sources) {
    const id = source.mainDataSourceId || source.dataSourceId
    const dataSource = id ? dataSources[id] : undefined
    if (dataSource?.itemId === itemId && dataSource.portalUrl) return dataSource.portalUrl
  }
  for (const dataSource of Object.values(dataSources)) {
    if (dataSource?.itemId === itemId && dataSource.portalUrl) return dataSource.portalUrl
  }
  return undefined
}

const Widget = (props: AllWidgetProps<ImmutableObject<IAudiomConfig>>) => {
  const [jimuMapView, setJimuMapView] = useState<JimuMapView>()
  const [mapSurface, setMapSurface] = useState<MountedMapSurface | null>(null)
  const [avatar, setAvatar] = useState<ReportedAvatar | null>(null)
  const [featurePopup, setFeaturePopup] = useState<{ lines: string[], longitude: number, latitude: number } | null>(null)
  const [runtimeStatus, setRuntimeStatus] = useState('')
  const [mapSourceTick, setMapSourceTick] = useState(0)
  const [hasChanges, setHasChanges] = useState(false)
  const [lastSyncedConfigJson, setLastSyncedConfigJson] = useState<string>('')
  // Per-widget MapSyncManager instance (shared with the same widget's
  // settings panel via the widget id key).
  const mapSyncManager = getMapSyncManager(props.id)
  
  // Check if Live View is enabled (appMode === Run means live view is active)
  const isLiveView = ReactRedux.useSelector((state: IMState) => 
    state?.appRuntimeInfo?.appMode === AppMode.Run
  )
  
  const { config: sanitizedConfig, warnings } = sanitizeConfig(toMutableConfig(props.config))
  
  // Log warnings once per unique set
  logWarnings(warnings)
  
  const activeViewChangeHandler = (jmv: JimuMapView) => {
    if (jmv) {
      setJimuMapView(jmv)
      // Clear changes indicator when map view is set (widget is being selected/focused)
      setHasChanges(false)
    }
  }

  // Listen for map changes to show the "changes detected" message
  useEffect(() => {
    if (!AUTO_SYNC_LAYERS || !sanitizedConfig?.useExistingMap || !sanitizedConfig?.existingMapId) {
      return
    }

    // Attach to the map and pass current config to detect initial mismatches
    mapSyncManager.attach(sanitizedConfig.existingMapId, sanitizedConfig)

    // Store the initial synced config (only locked sources for comparison)
    const initialJson = serializeLockedForDiff(sanitizedConfig.sourceConfigs)
    setLastSyncedConfigJson(initialJson)

    // Listen for changes
    const onMapChange = () => {
      if (mapSyncManager.hasChanges(sanitizedConfig.existingMapId, sanitizedConfig)) {
        setHasChanges(true)
      }
    }

    mapSyncManager.addChangeListener(onMapChange)

    return () => {
      mapSyncManager.removeChangeListener(onMapChange)
    }
  }, [sanitizedConfig?.useExistingMap, sanitizedConfig?.existingMapId, sanitizedConfig, mapSyncManager])

  // Clear changes indicator when config updates (means settings panel synced)
  // Only compare locked sources — unlocked sources are manually controlled
  useEffect(() => {
    const currentJson = serializeLockedForDiff(sanitizedConfig?.sourceConfigs)
    if (currentJson !== lastSyncedConfigJson && lastSyncedConfigJson !== '') {
      // Config changed, meaning settings panel likely synced it
      setHasChanges(false)
      setLastSyncedConfigJson(currentJson)
    } else if (lastSyncedConfigJson === '') {
      // Initial load
      setLastSyncedConfigJson(currentJson)
    }
  }, [sanitizedConfig?.sourceConfigs, lastSyncedConfigJson])

  const runtimeLocation = runtimeLocationOf(sanitizedConfig)
  const bundledMapItemIdRef = useRef('')
  // Adding a map writes the data source into the builder store before the
  // widget props update. Refresh only when that connected item changes.
  useEffect(() => {
    const store = getAppStore() as {
      subscribe?: (listener: () => void) => (() => void) | void
    }
    return store.subscribe?.(() => {
      const nextItemId = selectedMapItemId(props, sanitizedConfig.mapItemId)
      if (nextItemId === bundledMapItemIdRef.current) return
      setMapSourceTick((tick) => tick + 1)
    })
  }, [props, sanitizedConfig.mapItemId])
  // The selector updates useDataSources before config.mapItemId is saved.
  // Follow the connection so adding or removing a source updates immediately.
  const bundledMapItemId = selectedMapItemId(props, sanitizedConfig.mapItemId)
  bundledMapItemIdRef.current = bundledMapItemId
  void mapSourceTick
  // Bundled mode draws EsriMapSurface. It has no JimuMapView. Building the
  // iframe URL here calls the embed extractor on every indicator move and
  // logs "No map view available". The iframe is the only caller.
  const embedUrl = isIntegratedRuntime(runtimeLocation)
    ? ''
    : audiomConfigToEmbedConfig(
      { ...DEFAULT_CONFIG, ...sanitizedConfig, useExistingMap: false },
      jimuMapView
    ).toUrl(sanitizedConfig.baseUrl || DEFAULT_CONFIG.baseUrl)
  const title = props.config.title || 'Audiom'
  const soundpackUrl = runtimeLocation === RuntimeLocation.Bundled
    ? resolveSoundpackUrl(sanitizedConfig.soundpackUrl, sanitizedConfig.assetBaseUrl)
    : undefined
  const soundpackFallbackUrl = runtimeLocation === RuntimeLocation.Bundled
    ? resolveSoundpackFallbackUrl(sanitizedConfig.soundpackUrl, sanitizedConfig.assetBaseUrl)
    : undefined
  const bundledHandle = useBundledRuntime(
    runtimeLocation === RuntimeLocation.Bundled && Boolean(bundledMapItemId),
    props.id,
    jimuMapView,
    setRuntimeStatus,
    mapSurface,
    setAvatar,
    sanitizedConfig.centerLongitude,
    sanitizedConfig.centerLatitude,
    stepSizeMeters(sanitizedConfig.stepSize, sanitizedConfig.stepSizeUnit),
    soundpackUrl,
    soundpackFallbackUrl,
    (sanitizedConfig.sourceConfigs || []).map((source) => ({
      id: source.source,
      title: source.name,
      url: source.sourceUrl,
      mapType: source.mapType
    })),
    bundledMapItemId
  )
  const embedOverlay = useRef<HTMLDivElement>(null)
  const headerHeight = useHeaderHeight(embedOverlay)
  useAudiomEmbed(
    embedOverlay,
    mapSurface,
    bundledHandle,
    runtimeLocation === RuntimeLocation.Bundled
  )
  const showPopup = (point: FeatureClickPoint | null) => {
    if (!point) {
      setFeaturePopup(null)
      return
    }
    const world = bundledHandle?.program?.world
    const withStatistic = includeStatistic(world, sanitizedConfig.sourceConfigs)
    const lines: string[] = []
    const name = point.name?.trim()
    if (name) lines.push(name)
    const stat = withStatistic ? statisticLine(world, point) : ''
    if (stat) lines.push(stat)
    // The clicked graphic wins. Audiom's world content is only the fallback.
    const resolved = lines.length
      ? lines
      : (world && withStatistic
        ? audiomPopupLines(world, point.longitude, point.latitude)
        : (name ? [name] : []))
    if (!resolved.length) {
      setFeaturePopup(null)
      return
    }
    setFeaturePopup({ lines: resolved, longitude: point.longitude, latitude: point.latitude })
  }
  // Follow already hit-tested the painted graphic. Speech must say the
  // same lines the tooltip shows: name, then statistic. A click only opens
  // the popup. Coordinates are the screen-reader status, not this utterance.
  const followPopup = (point: FeatureClickPoint | null) => {
    // The load report sets openPopup false. Do not speak that plot, and do
    // not record it for the first step. A real move sets the flag true.
    if (point?.openPopup === false) return
    showPopup(point)
    const world = bundledHandle?.program?.world
    const withStatistic = includeStatistic(world, sanitizedConfig.sourceConfigs)
    const lines: string[] = []
    const name = point?.name?.trim()
    if (name) lines.push(name)
    if (point && withStatistic) {
      const stat = statisticLine(world, point)
      if (stat) lines.push(stat)
    }
    const field = (world as { statistics?: { field?: string } } | null | undefined)?.statistics?.field
    const statistic = withStatistic && field && point?.attributes
      ? point.attributes[field]
      : undefined
    bundledHandle?.program?.announceStanding?.(
      lines.length ? lines.join('. ') : null,
      statistic
    )
  }

  if (isIntegratedRuntime(runtimeLocation)) {
    const bundled = runtimeLocation === RuntimeLocation.Bundled
    const mapWidgetId = bundled ? '' : (props.useMapWidgetIds?.[0] || sanitizedConfig.existingMapId)
    const existingMap = bundled
      ? undefined
      : (jimuMapView as { view?: { map?: unknown } } | undefined)?.view?.map
    const mapLabel = bundledStatus(bundledHandle, false)
    const scene = bundled && props.useDataSources?.some((source) =>
      String(source.dataSourceId || '').toUpperCase().includes('WEB_SCENE')
    )
    // No item yet means there is no data-source JSON. Mounting the map
    // (or asking ExB to resolve that source) reads portalUrl off null.
    const needsMapSource = bundled && !bundledMapItemId
    return (
      <div
        className="jimu-widget"
        role="region"
        aria-label={title}
        style={styles.container}
      >
        {!bundled && mapWidgetId && (
          <JimuMapViewComponent useMapWidgetId={mapWidgetId} onActiveViewChange={activeViewChangeHandler} />
        )}
        <div style={styles.container}>
          {needsMapSource ? (
            <p role="status" style={styles.mapSourcePrompt}>{SET_MAP_SOURCE_MESSAGE}</p>
          ) : (
          <EsriMapSurface
            existingMap={existingMap}
            mapItemId={bundled ? bundledMapItemId : undefined}
            portalUrl={bundled ? portalUrlForItem(props, bundledMapItemId) : undefined}
            scene={scene}
            longitude={sanitizedConfig.centerLongitude}
            latitude={sanitizedConfig.centerLatitude}
            zoom={sanitizedConfig.zoom}
            headerHeight={headerHeight}
            avatar={avatar}
            onMove={runtimeLocation === RuntimeLocation.Bundled
              ? (direction) => {
                // The key handler already started the browser resume. Wait
                // for the pack before the step, or the first tone looks up
                // samples that have not loaded and stays silent. A failed
                // unlock still moves: speech does not need the pack, and
                // holding the indicator would trap the user.
                const pending = bundledHandle?.program?.unlockAudio?.()
                void Promise.resolve(pending).then(() => {
                  void bundledHandle?.runtime.moveAvatar(direction)
                })
              }
              : undefined}
            onDrop={runtimeLocation === RuntimeLocation.Bundled
              ? (longitude, latitude) => bundledHandle?.dropAvatar?.(longitude, latitude) ?? Promise.resolve(false)
              : undefined}
            onSelect={runtimeLocation === RuntimeLocation.Bundled
              ? () => { void bundledHandle?.runtime.focusRuntime(bundledFocusTarget) }
              : undefined}
            onFeatureClick={runtimeLocation === RuntimeLocation.Bundled ? showPopup : undefined}
            onFeatureFollow={runtimeLocation === RuntimeLocation.Bundled ? followPopup : undefined}
            onUnlock={runtimeLocation === RuntimeLocation.Bundled
              ? () => {
                primeBundledAudio(bundledHandle)
                return unlockBundledAudio(bundledHandle)
              }
              : undefined}
            popup={featurePopup}
            onPopupClose={() => { setFeaturePopup(null) }}
            onSurface={setMapSurface}
          />
          )}
          <div
            ref={embedOverlay}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'visible', zIndex: 8, pointerEvents: 'none' }}
          />
        </div>
        {!needsMapSource && (
        <p className="sr-only" role="status">
          {avatar
            ? `Position ${avatar.longitude.toFixed(3)}, ${avatar.latitude.toFixed(3)}. Heading ${Math.round(avatar.heading)} degrees.`
            : mapLabel}
          {runtimeStatus ? `. ${runtimeStatus}` : ''}
        </p>
        )}
      </div>
    )
  }

  return (
    <div className="jimu-widget" style={styles.container}>
      {props.useMapWidgetIds && props.useMapWidgetIds.length === 1 && (
        <JimuMapViewComponent useMapWidgetId={props.useMapWidgetIds?.[0]} onActiveViewChange={activeViewChangeHandler} />
      )}
      <MessagePopup 
        show={hasChanges && JimuConfig.getInstance().isInBuilder() && !isLiveView} 
        message="Map changes detected. Select the Audiom widget to re-synchronize."
        variant={MessageType.Warning}
      />
      <iframe
        name="audiom"
        src={embedUrl}
        style={styles.iframe}
        title={props.config.title || 'Audiom Widget'}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
        referrerPolicy="no-referrer"
      />
    </div>
  )
}
/**
 * The embed paints its header into the overlay after mount. Measure that
 * bar so the Esri map starts below it instead of showing through the bar.
 */
function useHeaderHeight (overlay: { current: HTMLDivElement | null }): number {
  const [height, setHeight] = useState(0)
  useEffect(() => {
    const node = overlay.current
    if (!node) return
    const measure = () => {
      const header = node.querySelector('.audiomHeader')
      setHeight(header ? Math.ceil(header.getBoundingClientRect().height) : 0)
    }
    measure()
    const observer = new MutationObserver(measure)
    observer.observe(node, { childList: true, subtree: true })
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [overlay])
  return height
}


/** True when settings hold a place, not the unset 0,0 default. */
function hasMapCenter (longitude?: number, latitude?: number): boolean {
  if (longitude == null || latitude == null) return false
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false
  return !(longitude === 0 && latitude === 0)
}

function EsriMapSurface (props: {
  existingMap?: unknown
  mapItemId?: string
  portalUrl?: string
  scene?: boolean
  longitude?: number
  latitude?: number
  zoom?: number
  headerHeight?: number
  avatar?: ReportedAvatar | null
  onMove?: (direction: string) => void
  onDrop?: (longitude: number, latitude: number) => Promise<boolean>
  popup?: { lines: string[], longitude: number, latitude: number } | null
  onPopupClose?: () => void
  onSelect?: () => void
  onFeatureClick?: (point: FeatureClickPoint | null) => void
  onFeatureFollow?: (point: FeatureClickPoint | null) => void
  onUnlock?: () => void | Promise<boolean>
  onScreen?: (point: { x: number, y: number } | null) => void
  onSurface?: (surface: MountedMapSurface | null) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const mountedSurface = useRef<MountedMapSurface | null>(null)
  const onSurface = props.onSurface
  const onScreen = props.onScreen
  const onDrop = props.onDrop
  const onSelect = props.onSelect
  const onFeatureClick = props.onFeatureClick
  const [screen, setScreen] = useState<{ x: number, y: number } | null>(null)
  const [dragScreen, setDragScreen] = useState<{ x: number, y: number } | null>(null)
  const [surfaceReady, setSurfaceReady] = useState(false)
  const [popupScreen, setPopupScreen] = useState<{ x: number, y: number } | null>(null)
  const avatar = props.avatar
  // The compass is the configured center until Audiom reports a position.
  // Waiting on that report is what left the map with no navigation icon.
  const placed = avatar ?? (
    props.longitude != null && props.latitude != null
      ? { longitude: props.longitude, latitude: props.latitude, heading: 0 }
      : null
  )
  const centerReady = !props.mapItemId || hasMapCenter(props.longitude, props.latitude)
  // Freeze the first real center for this item. A later pan writes a new
  // center into settings; using that as the mount point would rebuild the
  // view. A different item is a different place, so its center is new.
  const mountCenter = useRef<{ itemId?: string, longitude?: number, latitude?: number, zoom?: number } | null>(null)
  if (mountCenter.current && mountCenter.current.itemId !== props.mapItemId) {
    mountCenter.current = null
  }
  if (!mountCenter.current && centerReady) {
    mountCenter.current = {
      itemId: props.mapItemId,
      longitude: props.longitude,
      latitude: props.latitude,
      zoom: props.zoom
    }
  }
  useEffect(() => {
    const node = container.current
    if (!node) return
    // A portal item with no center yet would mount at 0,0. That is the
    // ocean, and the indicator then has to chase a view that started wrong.
    // Wait until the settings center is a real place, then mount once.
    if (!centerReady) return
    let cancelled = false
    let surface: MountedMapSurface | null = null
    // Center and zoom updates must not rebuild the view. WebMap.load starts
    // in the constructor, and destroying the view aborts that item request.
    const current = mountedSurface.current
    const sameItem = current?.mapItemId === props.mapItemId
      && current.portalUrl === props.portalUrl
      && current.scene === Boolean(props.scene)
      && current.existingMap === props.existingMap
    if (current && !sameItem) {
      destroyMapSurface(current)
      mountedSurface.current = null
      delete (node as { __audiomSurface?: MountedMapSurface }).__audiomSurface
    }
    if (mountedSurface.current && sameItem) {
      surface = current
      ;(node as { __audiomSurface?: MountedMapSurface }).__audiomSurface = current
      setSurfaceReady(true)
      onSurface?.(current)
      return () => {
        cancelled = true
      }
    }
    void mountEsriMap({
      container: node,
      existingMap: props.existingMap,
      portalUrl: props.portalUrl,
      mapItemId: props.mapItemId,
      scene: props.scene,
      longitude: mountCenter.current?.longitude,
      latitude: mountCenter.current?.latitude,
      zoom: mountCenter.current?.zoom
    }).then((mounted) => {
      mounted.mapItemId = props.mapItemId
      mounted.portalUrl = props.portalUrl
      mounted.scene = Boolean(props.scene)
      mounted.existingMap = props.existingMap
      if (cancelled) {
        destroyMapSurface(mounted)
        return
      }
      const loaded = mounted.view as { when?: () => Promise<unknown> }
      if (typeof loaded.when === 'function') {
        void loaded.when().catch((error: unknown) => {
          // eslint-disable-next-line no-console
          console.error('Audiom map view failed to load', error)
        })
      }
      surface = mounted
      mounted.onIndicatorClick = () => {
        node.focus()
        onSelect?.()
      }
      mounted.onFeatureClick = (point) => {
        onFeatureClick?.(point)
      }
      ;(node as { __audiomSurface?: MountedMapSurface }).__audiomSurface = mounted
      mountedSurface.current = mounted
      setSurfaceReady(true)
      onSurface?.(mounted)
    }).catch(() => {
      setSurfaceReady(false)
      onSurface?.(null)
    })
    return () => {
      cancelled = true
      if (mountedSurface.current === surface) mountedSurface.current = null
      setSurfaceReady(false)
      destroyMapSurface(surface)
      delete (node as { __audiomSurface?: MountedMapSurface }).__audiomSurface
      onSurface?.(null)
    }
  }, [props.existingMap, props.mapItemId, props.portalUrl, props.scene, centerReady, onSurface])
  // The view is created at the settings center and zoom. A step recenters
  // on the indicator and leaves the zoom the user has. Passing zoom here
  // snaps a live-view zoom back to the settings value on every move.
  // Settings overwrite zoom on their own, through the mount and the effect
  // below. Do not goTo the settings center itself, or a pan echo pulls the
  // view off the indicator.
  useEffect(() => {
    const node = container.current as { __audiomSurface?: MountedMapSurface } | null
    const view = node?.__audiomSurface?.view
    if (!view?.goTo || !surfaceReady || !avatar) return
    if (!Number.isFinite(avatar.longitude) || !Number.isFinite(avatar.latitude)) return
    if (avatar.longitude === 0 && avatar.latitude === 0) return
    void view.goTo({ center: [avatar.longitude, avatar.latitude] }).catch((): void => undefined)
  }, [avatar, surfaceReady])
  const appliedZoom = useRef<number | undefined>(undefined)
  useEffect(() => {
    const node = container.current as { __audiomSurface?: MountedMapSurface } | null
    const view = node?.__audiomSurface?.view
    if (!view?.goTo || !surfaceReady) return
    if (typeof props.zoom !== 'number' || !Number.isFinite(props.zoom)) return
    // The first value is the zoom the view was mounted at. Applying it
    // again is what snaps a live-view zoom back out. Only a later settings
    // write should move the zoom.
    if (appliedZoom.current === undefined) {
      appliedZoom.current = props.zoom
      return
    }
    if (appliedZoom.current === props.zoom) return
    appliedZoom.current = props.zoom
    void view.goTo({ zoom: props.zoom }).catch((): void => undefined)
  }, [props.zoom, surfaceReady])
  useEffect(() => {
    const node = container.current as { __audiomSurface?: MountedMapSurface } | null
    if (!node?.__audiomSurface) return
    node.__audiomSurface.onIndicatorClick = () => {
      container.current?.focus()
      onSelect?.()
    }
    node.__audiomSurface.onFeatureClick = (point) => {
      onFeatureClick?.(point)
    }
  }, [onSelect, onFeatureClick])
  useEffect(() => {
    const node = container.current as { __audiomSurface?: MountedMapSurface } | null
    const surface = node?.__audiomSurface
    if (!surface || !placed) {
      setScreen(null)
      onScreen?.(null)
      return
    }
    let cancelled = false
    const place = () => {
      void avatarScreenPoint(surface, placed).then((point) => {
        if (cancelled) return
        setScreen(point)
        onScreen?.(point)
      })
    }
    void surface.view.when?.().then(() => {
      if (!cancelled) place()
    })
    place()
    const watch = surface.view.watch?.('extent', place)
    const stationary = surface.view.watch?.('stationary', place)
    const resize = surface.view.watch?.('size', place)
    const pointer = surface.view.on?.('pointer-move', place)
    return () => {
      cancelled = true
      watch?.remove?.()
      stationary?.remove?.()
      resize?.remove?.()
      pointer?.remove?.()
    }
  }, [placed, surfaceReady, onScreen])
  // The compass is a button above the map, so moving it never clicks the
  // map. Follow the avatar: hit test under it and show the same popup.
  // The first report is the load position. Do not speak it, and do not
  // open the tooltip until the user actually moves.
  const followed = useRef<ReportedAvatar | null>(null)
  useEffect(() => {
    const avatar = props.avatar
    const onFollow = props.onFeatureFollow
    const node = container.current as { __audiomSurface?: MountedMapSurface } | null
    const surface = node?.__audiomSurface
    if (!avatar || !surface || !onFollow) return
    const view = surface.view
    if (!view.hitTest) return
    const previous = followed.current
    followed.current = avatar
    // The runtime reports the load position, then reports it again once the
    // map surface exists. That second report is not a step. Do not open the
    // tooltip and do not speak the plot under the compass.
    const moved = previous != null && (
      previous.longitude !== avatar.longitude || previous.latitude !== avatar.latitude
    )
    let cancelled = false
    // avatarScreenPoint already positions the compass; reuse it so the popup
    // lands on the same pixel. A plain toScreen object returns null in Esri.
    void avatarScreenPoint(surface, avatar).then((screen) => {
      if (cancelled || !screen) return
      const { x, y } = screen
      const emit = (data?: { name: string | null, attributes: Record<string, unknown> | null }) => {
        onFollow({
          longitude: avatar.longitude,
          latitude: avatar.latitude,
          x,
          y,
          name: data?.name ?? undefined,
          attributes: data?.attributes ?? undefined,
          // The load position is not spoken and must not open a tooltip.
          openPopup: moved
        })
      }
      void view.hitTest?.({ x, y }).then(async (hit) => {
        if (cancelled) return
        // Only a painted pattern or color. The visual base layer is not one.
        const graphic = renderedGraphic(hit)
        if (!graphic) { emit(); return }
        emit(await featureDetails(graphic))
      }).catch(() => { if (!cancelled) emit() })
    }).catch(() => undefined)
    return () => { cancelled = true }
    // onFollow is a stable setter; depending on it would loop on each popup set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.avatar])
  // The popup is pinned to the plot's geography, not a fixed pixel. Re-project
  // it on every camera change so it stays over the feature, like the compass.
  useEffect(() => {
    const anchor = props.popup
    const node = container.current as { __audiomSurface?: MountedMapSurface } | null
    const surface = node?.__audiomSurface
    if (!anchor || !surface) {
      setPopupScreen(null)
      return
    }
    let cancelled = false
    const place = () => {
      void featureScreenPoint(surface, anchor.longitude, anchor.latitude).then((p) => {
        if (!cancelled) setPopupScreen(p)
      })
    }
    place()
    const watch = surface.view.watch?.('extent', place)
    const stationary = surface.view.watch?.('stationary', place)
    const resize = surface.view.watch?.('size', place)
    return () => {
      cancelled = true
      watch?.remove?.()
      stationary?.remove?.()
      resize?.remove?.()
    }
  }, [props.popup, surfaceReady])
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const direction = movementDirection(event.key)
    if (!direction || !props.onMove) return
    event.preventDefault()
    event.stopPropagation()
    // Start the browser resume inside this key event. Waiting for the unlock
    // promise before moving leaves the context suspended, so the step tone
    // is decoded and then played into silence. The move itself is one tick
    // later, after that resume has been requested.
    props.onUnlock?.()
    props.onMove(direction)
  }
  // DOM-level click, independent of Esri's own click event. Clicks on the
  // Esri canvas bubble to this container; positioning is container-relative.
  const onMapClick = (event: React.MouseEvent<HTMLDivElement>) => {
    // A click on the map is a user gesture. Start the resume before the hit test.
    props.onUnlock?.()
    const node = container.current as { __audiomSurface?: MountedMapSurface } | null
    const surface = node?.__audiomSurface
    const box = container.current?.getBoundingClientRect()
    if (!surface || !box) return
    const x = event.clientX - box.left
    const y = event.clientY - box.top
    const view = surface.view
    const map = view.toMap?.({ x, y })
    const longitude = map?.longitude ?? 0
    const latitude = map?.latitude ?? 0
    const emit = (data?: { name: string | null, attributes: Record<string, unknown> | null }) => {
      onFeatureClick?.({ longitude, latitude, x, y, name: data?.name ?? undefined, attributes: data?.attributes ?? undefined })
    }
    if (!view.hitTest) {
      emit()
      return
    }
    void view.hitTest({ x, y }).then(async (hit) => {
      if (hit.results?.some((result) => result.graphic?.attributes?.audiomAvatar)) return
      // Only a painted pattern or color. The visual base layer is not one.
      const graphic = renderedGraphic(hit)
      if (!graphic) {
        emit()
        return
      }
      emit(await featureDetails(graphic))
    }).catch(() => { emit() })
  }
  return (
    <div style={{ position: 'absolute', zIndex: 1, top: props.headerHeight || 0, right: 0, bottom: 0, left: 0 }}>
      <div
        id="audiom-esri-map"
        ref={container}
        className="widget-map mapview-container"
        role="application"
        aria-label="Audiom map"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onClick={onMapClick}
        style={{ position: 'absolute', inset: 0 }}
      />
      <FeaturePopup popup={props.popup && popupScreen ? { lines: props.popup.lines, x: popupScreen.x, y: popupScreen.y } : null} onClose={props.onPopupClose} />
      <AudiomIndicator
        avatar={placed}
        screen={dragScreen ?? screen}
        draggable={Boolean(onDrop)}
        onMove={props.onMove}
        onSelect={onSelect}
        onDragStart={() => {
          if (screen) setDragScreen(screen)
        }}
        onDrag={(point) => { setDragScreen(point) }}
        onDragEnd={(point) => {
          const node = container.current as { __audiomSurface?: MountedMapSurface } | null
          const geographic = mapPointFromScreen(node?.__audiomSurface ?? null, point)
          if (!geographic || !onDrop) {
            setDragScreen(null)
            return
          }
          void onDrop(geographic.longitude, geographic.latitude).finally(() => {
            setDragScreen(null)
          })
        }}
        onDragCancel={() => { setDragScreen(null) }}
        onUnlock={props.onUnlock}
      />
    </div>
  )
}

/**
 * Audiom feature popup: the name, then its statistic as "label: value",
 * with a tail pointing down at the plot. Drawn in the compass box so a
 * click or an avatar move anchors it on the right pixel.
 */
function FeaturePopup (props: {
  popup: { lines: string[], x: number, y: number } | null
  onClose?: () => void
}) {
  if (!props.popup || props.popup.lines.length === 0) return null
  const lines = props.popup.lines
  return (
    <div
      role="dialog"
      aria-label={lines[0]}
      onWheel={replayWheelToMap}
      style={{
        position: 'absolute',
        left: props.popup.x,
        top: props.popup.y,
        zIndex: 40,
        width: 'max-content',
        maxWidth: '18rem',
        transform: 'translate(-50%, calc(-100% - 10px))',
        padding: '0.5rem 1.75rem 0.5rem 0.75rem',
        background: '#fff',
        color: '#04203e',
        border: '0.125rem solid #04203e',
        borderRadius: 4,
        pointerEvents: 'auto',
        fontSize: '1rem',
        lineHeight: 1.4,
        overflowWrap: 'break-word'
      }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={props.onClose}
        style={{
          position: 'absolute',
          top: 2,
          right: 2,
          width: 24,
          height: 24,
          padding: 0,
          border: 0,
          background: 'transparent',
          color: '#04203e',
          fontSize: '1.25rem',
          lineHeight: 1,
          cursor: 'pointer'
        }}
      >
        ×
      </button>
      {lines.map((line, index) => (
        <p key={`${index}-${line}`} style={{ margin: 0, fontWeight: index === 0 ? 700 : 400 }}>{line}</p>
      ))}
      <span style={{ position: 'absolute', bottom: -10, left: '50%', marginLeft: -9, width: 0, height: 0, borderLeft: '9px solid transparent', borderRight: '9px solid transparent', borderTop: '10px solid #04203e' }} />
      <span style={{ position: 'absolute', bottom: -7, left: '50%', marginLeft: -7, width: 0, height: 0, borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: '8px solid #fff' }} />
    </div>
  )
}

/**
 * Audiom's compass, drawn by this widget's React. The component cannot be
 * mounted inside the map div: Esri replaces that node's children.
 * Paths are Audiom's VisualCursor paths.
 * Bundled mode drags this button the way Audiom drags its marker. The
 * avatar does not move until the pointer is released.
 */
function AudiomIndicator (props: {
  avatar: ReportedAvatar | null
  screen: { x: number, y: number } | null
  draggable?: boolean
  onMove?: (direction: string) => void
  onSelect?: () => void
  onDragStart?: () => void
  onDrag?: (point: { x: number, y: number }) => void
  onDragEnd?: (point: { x: number, y: number }) => void
  onUnlock?: () => void | Promise<boolean>
  onDragCancel?: () => void
}) {
  const avatar = props.avatar
  const screen = props.screen
  const button = useRef<HTMLButtonElement>(null)
  const drag = useRef<{
    pointerId: number
    originX: number
    originY: number
    grabX: number
    grabY: number
    moved: boolean
  } | null>(null)
  if (!avatar || !screen) return null
  const overlayPoint = (event: { clientX: number, clientY: number }): { x: number, y: number } | null => {
    const overlay = button.current?.offsetParent
    if (!(overlay instanceof HTMLElement)) return null
    const box = overlay.getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }
  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    // pointerdown is the gesture. Unlock before the drag threshold so the
    // first grab still resumes Audiom's audio context.
    props.onUnlock?.()
    if (!props.draggable || event.button !== 0) return
    const point = overlayPoint(event)
    drag.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      grabX: point ? point.x - screen.x : 0,
      grabY: point ? point.y - screen.y : 0,
      moved: false
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.stopPropagation()
  }
  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    const dx = event.clientX - active.originX
    const dy = event.clientY - active.originY
    if (!active.moved && Math.hypot(dx, dy) < 4) return
    if (!active.moved) {
      active.moved = true
      props.onDragStart?.()
    }
    const point = overlayPoint(event)
    if (point && active) props.onDrag?.({ x: point.x - active.grabX, y: point.y - active.grabY })
  }
  const finishDrag = (event: React.PointerEvent<HTMLButtonElement>, commit: boolean) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!active.moved) {
      if (commit) props.onSelect?.()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const point = overlayPoint(event)
    if (commit && point && active) {
      props.onDragEnd?.({ x: point.x - active.grabX, y: point.y - active.grabY })
    } else props.onDragCancel?.()
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const direction = movementDirection(event.key)
    if (!direction || !props.onMove) return
    event.preventDefault()
    event.stopPropagation()
    // Start the browser resume inside this key event, then move. Awaiting
    // the unlock before the move plays the tone into a suspended context.
    props.onUnlock?.()
    props.onMove(direction)
  }
  // The compass sits above the map, so the wheel never reaches Esri.
  // Replay it on the map view; click and keyboard stay on this button.
  const onWheel = replayWheelToMap
  return (
    <>
      <button
        ref={button}
        type="button"
        className="audiom-cursor"
        aria-label="Audiom navigation indicator"
        onKeyDown={onKeyDown}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => { finishDrag(event, true) }}
        onPointerCancel={(event) => { finishDrag(event, false) }}
        onClick={() => {
          props.onUnlock?.()
          // Keyboard activation has no pointer. A pointer click is the
          // pointerup above; handling both would select twice.
          if (!props.draggable) props.onSelect?.()
        }}
        style={{
          position: 'absolute',
          left: screen.x,
          top: screen.y,
          width: 52,
          height: 52,
          marginLeft: -26,
          marginTop: -26,
          padding: 0,
          border: 0,
          borderRadius: '50%',
          background: 'transparent',
          zIndex: 30,
          cursor: props.draggable ? 'grab' : 'pointer',
          touchAction: 'none',
          transform: `rotate(${avatar.heading}deg)`
        }}
      >
        <span className="audiom-cursor-pulse">
          <AudiomCompass />
        </span>
      </button>
      <style>{AUDIOM_CURSOR_PULSE}</style>
    </>
  )
}

/**
 * Audiom's sound unlock. A sibling of the map div, never a child of it.
 * The click resumes Audiom's audio context. This widget does not play a beep.
 */
function AudiomSoundControl (props: {
  soundpackUrl?: string
  onUnlock: () => void
}) {
  if (!props.soundpackUrl) return null
  return (
    <button
      type="button"
      onClick={props.onUnlock}
      style={{
        position: 'absolute',
        left: 8,
        bottom: 8,
        zIndex: 9,
        pointerEvents: 'auto',
        padding: '0.4rem 0.7rem',
        border: '1px solid #04203e',
        borderRadius: 4,
        background: '#fff',
        color: '#04203e'
      }}
    >
      Enable sounds and skip to map
    </button>
  )
}

/** Audiom VisualCursor paths. Rendered with jimu-core React, not Audiom's React. */
function AudiomCompass () {
  return (
    <svg width="33" height="30" viewBox="0 0 337 308" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M331.07 256.95L303.27 208.32L257.64 128.46L257.17 127.66L247.36 110.49L238.96 95.82L193.12 15.63C188.07 6.77001 178.34 1.04001 168.35 1.04001H167.34C157.39 1.04001 148.35 6.47001 143.17 15.55L88.8899 110.49L78.3499 128.9L78.2899 129.03L54.75 170.21L32.95 208.32L15.9899 238L5.21995 256.86C-0.290052 266.5 -0.670052 278.22 4.20995 288.19C9.87995 299.83 21.4299 307.06 34.3499 307.06H127.71C138 307.06 148.12 303.55 156.28 297.1L156.5 296.92C157.01 296.5 157.51 296.09 158.02 295.63C160.96 293.08 163.58 290.13 165.82 286.84L168.16 283.4L170.5 286.85C179.09 299.5 193.35 307.05 208.63 307.05H301.96C308.36 307.05 314.55 305.27 319.89 301.9L320.46 301.54L320.96 301.09C324.49 297.92 327.71 294.38 330.53 290.57L331.96 288.64L332.29 287.94C337 278 336.54 266.41 331.09 256.95H331.07ZM143.7 271.82C142.76 273.2 141.65 274.44 140.41 275.51L140.24 275.66C140.02 275.86 139.8 276.03 139.59 276.21C136.21 278.86 131.99 280.33 127.7 280.33H34.34C31.68 280.33 29.3999 278.89 28.2199 276.48C27.6299 275.27 26.8699 272.83 28.4199 270.12L39.1899 251.26L56.15 221.59L77.9499 183.48L101.86 141.65L101.92 141.53L112.09 123.76L166.38 28.8C166.83 28.02 167.27 27.78 167.33 27.76L167.83 27.8L168.35 27.77C168.67 27.77 169.51 28.17 169.91 28.88L215.76 109.09L224.16 123.76L234.06 141.09L234.48 141.79L280.07 221.58L307.31 269.24V277.71C306.06 279.37 304.13 280.32 301.94 280.32H208.61C202.18 280.32 196.19 277.15 192.59 271.84L168.13 235.78L143.69 271.82H143.7Z" fill="#000" stroke="#000" />
      <path d="M241.01 137.13L240.04 137.75H241.38L241.01 137.13Z" fill="#0088A6" />
      <path d="M315.34 279.92L315.31 279.89C315.31 279.89 315.28 279.95 315.25 279.98L264.87 247.28L219.18 217.61L168.14 184.47L167.85 19.77C171.19 19.55 174.95 21.55 176.86 24.89L222.71 105.1L231.11 119.78L241.01 137.11L240.04 137.73H241.38L252.75 157.63L287.01 217.6L303.97 247.27L314.81 266.23C317.4 270.73 317.31 275.76 315.34 279.91V279.92Z" fill="#0088A6" />
      <path d="M315.25 279.99C312.94 284.8 308.04 288.33 301.94 288.33H208.61C199.55 288.33 191.06 283.83 185.97 276.34L184.72 274.5L168.14 250.04L150.31 276.34C148.97 278.31 147.41 280.06 145.63 281.59C145.29 281.9 144.94 282.18 144.6 282.46C139.85 286.21 133.92 288.33 127.7 288.33H34.34C28.25 288.33 23.38 284.8 21.03 279.99L71.38 247.29L117.04 217.62L137.25 204.5L168.11 184.45H168.14V184.48L219.18 217.62L264.87 247.29L315.25 279.99Z" fill="#0097B7" />
      <path d="M167.85 19.78L168.14 184.44H168.11L137.25 204.49L117.04 217.61L71.3801 247.28L21.0301 279.98C19.0001 275.83 18.8401 270.73 21.4701 266.14L32.2501 247.27L49.2101 217.6L71.0101 179.5L94.8101 137.87L94.8701 137.74L105.15 119.78L116.24 100.38L159.44 24.83C161.35 21.49 164.52 19.55 167.86 19.77L167.85 19.78Z" fill="#00A9DA" />
    </svg>
  )
}

/** Audiom's cursor pulse. Same keyframes as AudioMapControls `.control:focus::after`. */
const AUDIOM_CURSOR_PULSE = `
/* The button is positioned on the map. Do not set position:relative on
   .audiom-cursor: that overrides the inline left/top and pins it in the widget. */
.audiom-cursor-pulse {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
.audiom-cursor svg { width: 1.75rem; height: auto; display: block; transform: translateY(-0.0625rem); }
.audiom-cursor:focus { outline: none; }
.audiom-cursor:focus .audiom-cursor-pulse::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #04203e;
  border-radius: 50%;
  z-index: -1;
  animation: audiom-grow-and-fade 1.75s infinite;
}
@keyframes audiom-grow-and-fade {
  from { opacity: 1; transform: scale(0); }
  to { opacity: 0; transform: scale(1.25); }
}
@media (prefers-reduced-motion: reduce) {
  .audiom-cursor:focus .audiom-cursor-pulse::after { animation: none; }
}
`

function stepSizeMeters (value?: number, unit?: StepSizeUnit): number | undefined {
  const size = value ?? DEFAULT_CONFIG.stepSize
  const stepUnit = unit ?? DEFAULT_CONFIG.stepSizeUnit
  if (!size || size <= 0) return undefined
  return StepSize.create(size, stepUnit).toMeters().value
}

function movementDirection (key: string): string | null {
  if (key === 'ArrowUp') return 'up'
  if (key === 'ArrowDown') return 'down'
  if (key === 'ArrowLeft') return 'left'
  if (key === 'ArrowRight') return 'right'
  return null
}

/**
 * Audiom's own React root, beside the Esri map node. Esri replaces children
 * of the map div, so this overlay is a sibling. The menu mounts as soon as
 * the surface exists; the session is passed in when the program starts.
 * Argument order matches the call site: overlay, surface, handle, enabled.
 * Swapping overlay and enabled makes the ref look like a boolean, so the
 * menu, header, and legend never mount.
 */
function useAudiomEmbed (
  overlay: { current: HTMLDivElement | null },
  surface: MountedMapSurface | null,
  handle: BundledRuntimeHandle | null,
  enabled: boolean
): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const node = overlay.current
    // The menu does not wait on the program. A failed program used to skip
    // this effect entirely, which is why the button never appeared.
    if (!enabled || !node || !surface) {
      setMounted(false)
      return
    }
    let cancelled = false
    let release: (() => void) | undefined
    try {
      // Experience Builder compiles this sibling file with the widget.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const compiled = require('../../../../../../../../Audiom-Front-End/src/runtime/exbEntry') as {
        mountAudiomEmbed?: (
          container: HTMLElement,
          options: {
            session: { world: unknown } | null
            view: MountedMapSurface['view']
            project: typeof projectEmbedPoint
            controllerOptions: { welcome: false }
          }
        ) => { release: () => void }
        unmountAudiomEmbed?: (container: HTMLElement) => void
      }
      const session = handle?.program as { world?: unknown } | null
      if (!compiled.mountAudiomEmbed) {
        throw new Error('Audiom menu entry has no mountAudiomEmbed')
      }
      const controller = compiled.mountAudiomEmbed(node, {
        session: session?.world ? session as { world: unknown } : null,
        view: surface.view,
        project: projectEmbedPoint,
        controllerOptions: { welcome: false }
      })
      release = () => {
        controller?.release()
        compiled.unmountAudiomEmbed?.(node)
      }
      if (!cancelled) setMounted(true)
    } catch (error) {
      // The embed is optional; the hand-rolled compass stays if it fails.
      // Surface the reason instead of swallowing it.
      // eslint-disable-next-line no-console
      console.error('Audiom embed failed to mount', error)
      if (!cancelled) setMounted(false)
    }
    return () => {
      cancelled = true
      release?.()
      setMounted(false)
    }
  }, [enabled, surface, handle, overlay])
  return mounted
}

/** The slice of a view extent the navigation wall needs. */
interface ViewExtent {
  xmin?: number
  ymin?: number
  xmax?: number
  ymax?: number
  spatialReference?: { wkid?: number, isWGS84?: boolean, isWebMercator?: boolean }
}

/**
 * The drawn view extent as [west, south, east, north] in longitude and
 * latitude. The projection comes from the view's own spatial reference,
 * converted by the ArcGIS API, so no coordinate math is hard-coded here.
 */
async function geographicExtentOf (
  view: { extent?: ViewExtent } | undefined
): Promise<[number, number, number, number] | undefined> {
  const extent = view?.extent
  if (!extent) return undefined
  const { xmin, ymin, xmax, ymax, spatialReference: sr } = extent
  if (xmin == null || ymin == null || xmax == null || ymax == null) return undefined
  if (sr?.isWGS84 || sr?.wkid === 4326) return [xmin, ymin, xmax, ymax]
  if (!(sr?.isWebMercator || sr?.wkid === 102100 || sr?.wkid === 3857 || sr?.wkid === 102113)) {
    // An unsupported projection is left to the feature bbox fallback.
    return undefined
  }
  try {
    const [webMercatorUtils] = await loadArcGISJSAPIModules([
      'esri/geometry/support/webMercatorUtils'
    ]) as [{
      webMercatorToGeographic: (geometry: unknown) => {
        xmin?: number, ymin?: number, xmax?: number, ymax?: number
      } | null
    }]
    const geo = webMercatorUtils.webMercatorToGeographic(extent)
    if (!geo || geo.xmin == null || geo.ymin == null || geo.xmax == null || geo.ymax == null) {
      return undefined
    }
    return [geo.xmin, geo.ymin, geo.xmax, geo.ymax]
  } catch {
    return undefined
  }
}

function projectEmbedPoint (
  view: { toScreen?: (point: unknown) => { x?: number, y?: number } | null, container?: HTMLElement },
  longitude: number,
  latitude: number
): Promise<{ x: number, y: number } | null> {
  // The popup layer is a sibling of the map and starts at the same top as
  // the view. toScreen is already in that box. Do not shift it into
  // #audiom-embed: that node includes the header, so the popup lands under it.
  if (!view.toScreen) return Promise.resolve(null)
  const projected = view.toScreen({
    type: 'point',
    longitude,
    latitude,
    spatialReference: { wkid: 4326 }
  })
  if (projected?.x == null || projected.y == null) return Promise.resolve(null)
  return Promise.resolve({ x: projected.x, y: projected.y })
}

/**
 * The center a bundled session may be born at. 0,0 is the unset default,
 * not a place, so it must not become the projection origin. A later pan
 * writes a new center into settings; that is the same session, not a new
 * origin, and must not restart it.
 */
function sessionOriginKey (longitude?: number, latitude?: number): string {
  if (longitude == null || latitude == null) return ''
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return ''
  if (longitude === 0 && latitude === 0) return ''
  return 'placed'
}

function useBundledRuntime (
  enabled: boolean,
  instanceId: string,
  jimuMapView: JimuMapView | undefined,
  onStatus: (status: string) => void,
  surface: MountedMapSurface | null,
  onAvatar: (position: ReportedAvatar | null) => void,
  longitude?: number,
  latitude?: number,
  moveDistance?: number,
  soundpackUrl?: string,
  soundpackFallbackUrl?: string,
  mapTypes?: readonly SnapshotMapTypeHint[],
  mapItemId?: string
): BundledRuntimeHandle | null {
  const [handle, setHandle] = useState<BundledRuntimeHandle | null>(null)
  const [reported, setReported] = useState<ReportedAvatar | null>(null)
  // Read inside the snapshot effect without making it a dependency. A move
  // must not re-run the snapshot query (the layer load can take seconds).
  const reportedRef = useRef<ReportedAvatar | null>(null)
  const longitudeRef = useRef(longitude)
  const latitudeRef = useRef(latitude)
  const moveDistanceRef = useRef(moveDistance)
  // A Map Type change must not re-query the service. The snapshot effect
  // reads this ref. Putting mapTypes in its dependency array reloads every
  // layer, which is the long pause after the dropdown changes.
  const mapTypesRef = useRef(mapTypes)
  mapTypesRef.current = mapTypes
  const loadedSnapshot = useRef<MapSnapshot | null>(null)
  // The Map Type effect must not depend on the surface. A new surface
  // identity would republish. The paint still needs the map that is drawn.
  const drawnMapRef = useRef<unknown>(null)
  drawnMapRef.current = surface?.view?.map || jimuMapView?.view?.map || null
  longitudeRef.current = longitude
  latitudeRef.current = latitude
  moveDistanceRef.current = moveDistance
  // The session's projection origin is fixed at construction. Starting it
  // before the map center is written uses 0,0, and every later report is
  // then a point in the ocean. Restart once, when that center arrives.
  // A pan must not restart it: the origin is the center the session was
  // born with, not the latest settings write.
  const originKey = sessionOriginKey(longitude, latitude)
  // The center the session was born at. A later settings write that is
  // still this point is a pan echo. A different finite point is the user
  // overwriting Center, and the indicator has to move there.
  const bornCenter = useRef<{ longitude?: number, latitude?: number } | null>(null)
  // A new map source is a new place. Drop the previous indicator before
  // the next session reports, so the compass cannot stay on the old point.
  const previousMapItemId = useRef(mapItemId)
  if (previousMapItemId.current !== mapItemId) {
    previousMapItemId.current = mapItemId
    reportedRef.current = null
    if (reported) {
      setReported(null)
      onAvatar(null)
    }
  }
  useEffect(() => {
    if (!enabled) {
      setHandle(null)
      setReported(null)
      onAvatar(null)
      return
    }
    // Wait for the map center. A session born at 0,0 reports the ocean
    // for the rest of its life, and the map then follows that point.
    if (!originKey) return
    bornCenter.current = {
      longitude: longitudeRef.current,
      latitude: latitudeRef.current
    }
    const next = startBundledRuntime(
      mapItemId ? `${instanceId}:${mapItemId}` : instanceId,
      jimuMapView,
      onStatus,
      null,
      {
        longitude: longitudeRef.current,
        latitude: latitudeRef.current,
        moveDistance: moveDistanceRef.current,
        soundpackUrl,
        soundpackFallbackUrl
      }
    )
    next.bindSurface?.(surface)
    next.onReported = (state) => {
      const position = {
        longitude: state.position.longitude,
        latitude: state.position.latitude,
        heading: state.orientation
      }
      reportedRef.current = position
      // A new runtime starts at the configured point. That is not a step.
      onAvatar(position)
    }
    setHandle(next)
    return () => {
      next.onReported = undefined
      restoreAudiomStyles(jimuMapView)
      setReported(null)
      onAvatar(null)
      // runtime.dispose() does not stop the session. The old encounter
      // player and tones keep going on the shared engine unless the
      // program itself is disposed.
      next.program?.dispose()
      void next.runtime.dispose()
    }
  }, [enabled, instanceId, mapItemId, originKey, jimuMapView, onStatus, onAvatar, soundpackUrl, soundpackFallbackUrl])
  useEffect(() => {
    handle?.bindSurface?.(surface)
  }, [handle, surface])
  // A typed Center is a new place. placeAt keeps the session's origin, so
  // the report stays in degrees instead of becoming meters in the ocean.
  // The point the session was born at is not a move: a pan writes that
  // same center back, and following it would drag the indicator.
  useEffect(() => {
    if (!handle?.program?.placeAt) return
    if (longitude == null || latitude == null) return
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return
    if (longitude === 0 && latitude === 0) return
    const born = bornCenter.current
    if (born && born.longitude === longitude && born.latitude === latitude) return
    const placed = handle.program.placeAt(longitude, latitude)
    bornCenter.current = { longitude, latitude }
    const position = {
      longitude: placed.position.longitude,
      latitude: placed.position.latitude,
      heading: placed.orientation
    }
    reportedRef.current = position
    onAvatar(position)
  }, [handle, longitude, latitude, onAvatar])
  // The indicator starts at the set map's center. A pan must not move it.
  // A typed center does, through placeAt above. Drag, keyboard, and the
  // menu report through onReported rather than through this config.
  useEffect(() => {
    const drawn = surface?.view?.map || jimuMapView?.view?.map
    const map = drawn as {
      when?: () => Promise<unknown>
      allLayers?: {
        forEach: (fn: (layer: unknown) => void) => void
        on?: (eventName: string, handler: () => void) => { remove?: () => void }
      }
    } | undefined
    if (!handle?.program || !map) return
    let cancelled = false
    let layerHandle: { remove?: () => void } | undefined
    const drawnView = (surface?.view || jimuMapView?.view) as { extent?: ViewExtent } | undefined
    const view = { map }
    const paintChoice = async (snapshot: MapSnapshot) => {
      const program = handle.program as {
        world?: {
          statistics?: { field?: string, fields?: Array<{ field?: string }> }
          settings?: { vectorStyleMode?: VectorStyleMode }
          rootStore?: { settings?: { vectorStyleMode?: VectorStyleMode } }
        }
      } | null
      // The legend's field. A placeholder such as casesPerOneMillion is not in
      // the catalog, so it is not a selection. Count only columns the dropdown
      // lists. The first of those is ramp 0 on the first paint and after a
      // statistic change.
      const statistics = program?.world?.statistics
      const queried = (snapshot as MapSnapshot & {
        queriedLayers?: Array<{
          fields?: Array<{ name?: string, type?: string }>
          features?: Array<{ attributes?: Record<string, unknown> }>
        }>
      }).queriedLayers
      const known = statistics?.fields?.map((item) => item.field)
      const varying = catalogFields(queried)
      const published = (known?.length ? known : varying).filter((name) => varying.includes(name))
      const chosen = published.includes(statistics?.field || '')
        ? statistics?.field
        : published[0]
      // The legend toggles the injected store, not a private world copy.
      // Default is colors, matching SettingsStore, not both.
      const mode = paintStyleMode(program)
      // The embedded map counts the statistic's place in the dropdown.
      // The first statistic is ramp 0. A property-key index paints another ramp.
      const catalogIndex = chosen ? published.indexOf(chosen) : -1
      const paletteIndex = catalogIndex >= 0 ? catalogIndex : 0
      await paintAudiomStyles(
        view,
        snapshot,
        mode,
        chosen,
        paletteIndex,
        snapshot.sources.length === 1 ? snapshot.sources[0].mapType : undefined
      )
    }
    const apply = async () => {
      // Do not await view.when() or map.when(). A portal item that the a, mapTypespp
      // portal cannot see leaves those promises pending, and the legend
      // then never reads the layers that did load.
      if (cancelled) return
      // Query the whole service. Passing the drawn extent makes the page
      // the current view, and the next snapshot then drops the indicator
      // onto whichever plot is nearest in that page.
      const snapshot = await snapshotFeaturesFromMapView(view, instanceId, mapTypesRef.current)
      if (cancelled) return
      // Record the snapshot before any further async step so a pattern/color
      // repaint, or a Map Type change, has it without querying again.
      loadedSnapshot.current = snapshot
      // The navigation wall is the whole drawn map, not the bbox of the
      // features that loaded. Publish the view extent so the world fences to it.
      const extent = await geographicExtentOf(drawnView)
      if (cancelled) return
      if (extent) (snapshot as MapSnapshot & { extent?: [number, number, number, number] }).extent = extent
      const listed = snapshot.records.filter((record) => record.navigable).length
      const names = snapshot.sources.map((source) => source.displayName).join(', ')
      // eslint-disable-next-line no-console
      console.error('Audiom feature snapshot', snapshot.sources.length, 'layers', listed, 'features', names)
      const program = handle.program as {
        applySnapshot?: (snapshot: MapSnapshot) => Promise<unknown>
      } | null
      // Paint before publish. The publish can reject, and waiting on it left
      // the host renderer in place so the first load had no Audiom colors.
      // The mode is already on the settings store, so this paint honors it.
      await paintChoice(snapshot)
      if (cancelled) return
      if (program?.applySnapshot) await program.applySnapshot(snapshot)
      else await handle.runtime.replaceSources(snapshot, 1)
      if (cancelled) return
      // Publish can replace the placeholder field with the legend's statistic.
      // Paint that field too. A failed paint keeps the renderer just applied.
      await paintChoice(snapshot)
    }
    void apply().catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('Audiom feature snapshot failed', error)
    })
    // A web map adds its operational layers after the view object exists.
    // Snapshot again when that collection changes, or the legend stays empty.
    layerHandle = map.allLayers?.on?.('change', () => {
      void apply().catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.error('Audiom feature snapshot failed', error)
      })
    })
    // The legend changes the statistic and the pattern/color mode. Repaint
    // the snapshot already loaded. Querying again is what made recolor slow.
    const onPaint = () => {
      const loaded = loadedSnapshot.current
      if (!loaded) return
      void paintChoice(loaded).catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.error('Audiom repaint failed', error)
      })
    }
    window.addEventListener('audiom-embed-paint', onPaint)
    return () => {
      cancelled = true
      layerHandle?.remove?.()
      window.removeEventListener('audiom-embed-paint', onPaint)
    }
  }, [handle, jimuMapView, surface, instanceId])
  // Map Type is audio and the legend, not a new query. Retag the snapshot
  // already loaded and publish that. Querying the service again is the
  // long pause after the dropdown changes.
  const mapTypeKey = (mapTypes || []).map((item) => `${item.id || ''}:${item.mapType || ''}`).join('|')
  useEffect(() => {
    const loaded = loadedSnapshot.current
    if (!handle?.program || !mapTypeKey || !loaded) return
    const hints = mapTypesRef.current || []
    const retagged: MapSnapshot = {
      ...loaded,
      sources: loaded.sources.map((source) => {
        const hint = hints.find((item) => item.id === source.sourceId) ||
          (hints.length === 1 ? hints[0] : undefined)
        const raw = hint?.mapType === 'standard' ? 'travel' : hint?.mapType
        const next = raw === 'heatmap' || raw === 'indoor' || raw === 'travel'
          ? raw
          : 'travel'
        return next === source.mapType ? source : { ...source, mapType: next }
      })
    }
    loadedSnapshot.current = retagged
    const program = handle.program as {
      applySnapshot?: (snapshot: MapSnapshot) => Promise<unknown>
      world?: {
        statistics?: { field?: string, fields?: Array<{ field?: string }> }
        settings?: { vectorStyleMode?: VectorStyleMode }
        rootStore?: { settings?: { vectorStyleMode?: VectorStyleMode } }
      }
    } | null
    const drawn = drawnMapRef.current
    const paint = drawn
      ? paintAudiomStyles(
        { map: drawn },
        retagged,
        paintStyleMode(program),
        program?.world?.statistics?.field,
        undefined,
        retagged.sources.length === 1 ? retagged.sources[0].mapType : undefined
      )
      : Promise.resolve()
    const publish = program?.applySnapshot
      ? program.applySnapshot(retagged)
      : handle.runtime.replaceSources(retagged, 1)
    void paint.then(() => publish).catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('Audiom map type update failed', error)
    })
  }, [handle, mapTypeKey])
  useEffect(() => {
    if (!surface || !reported) return
    void showAvatar(surface, reported)
  }, [surface, reported])
  return handle
}

export default Widget
