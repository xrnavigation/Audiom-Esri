import { type AllWidgetProps, React, ReactRedux, AppMode, DataSourceTypes, getAppStore, loadArcGISJSAPIModules, type IMState, type ImmutableObject } from 'jimu-core'
import { audiomConfigToEmbedConfig } from '../utils/mapUtils'
import { getMapSyncManager, AUTO_SYNC_LAYERS } from '../utils/mapSyncManager'
import { dataSourcesFromAppState } from '../utils/appDataSources'
import { serializeLockedForDiff } from '../utils/sourceConfigUtils'
import { JimuMapView, JimuMapViewComponent } from 'jimu-arcgis'
import { DEFAULT_CONFIG, IAudiomConfig, toMutableConfig } from '../setting/configs'
import { sanitizeConfig, useLogWarnings as logWarnings } from '../setting/validation/validation'
import {
  DEFAULT_ASSET_BASE_URL,
  isIntegratedRuntime,
  RuntimeLocation,
  runtimeLocationOf
} from '../setting/runtimeLocation'
import MessagePopup, { MessageType } from './components/MessagePopup'
import { JimuConfig } from '../utils/JimuConfig'

import { bundledStatus, paintAudiomStyles, restoreAudiomStyles, startBundledRuntime, type BundledRuntimeHandle, type PointFeature, type RuntimeStyle } from './bundledRuntime'
import { VectorStyleMode } from './audiomSymbols'
import { snapshotFeaturesFromMapView, type MapSnapshot, type SnapshotMapTypeHint } from './mapSnapshot'
import { resolveRulesFileUrl } from './rulesStyle'
import { bundledSoundpackName, resolveSoundpackFallbackUrl, resolveSoundpackUrl } from './soundpackUrl'
import { MapType } from '../../../../shared/audiom-client/AudiomSource'
import { StepSize, StepSizeUnit } from '../../../../shared/audiom-client/StepSize'
import { MapControls, mapControlLabels, type MapControlView } from './mapControls'
import { RUNTIME_TRANSLATIONS, runtimeLocale } from './runtimeLocales'
import { guardFloorClicks, onEsriLayerChange, setEsriFloor, setEsriLayerVisible, type EsriFloorView } from './esriLayerSync'
import {
  AUDIOM_COMPASS_RADIUS,
  AUDIOM_COMPASS_SIZE,
  AUDIOM_MAP_ELEMENT_ID,
  AUDIOM_NAVY
} from './chrome'
import {
  avatarScreenPoint,
  destroyMapSurface,
  featureScreenPoint,
  dropViewPoint,
  mapPointFromScreen,
  readMountedSurface,
  roomUnderHit,
  mountEsriMap,
  showAvatar,
  writeMountedSurface,
  type FeatureClickPoint,
  type MountedMapSurface
} from './esriMapSurface'
import { isWebMercatorWkid, Wkid } from './spatialReference'
import type { ReportedAvatar } from './reportedAvatar'
import { ownedMapDataSourceId, publishOwnedMapView } from './publishMapView'
import { viewpointReadyForItem } from './mapViewpoint'

const { useState, useEffect, useRef, useCallback } = React

/**
 * Indoor and Travel name the plot. The statistic line is heatmap content,
 * and it is also content a rules file adds. With no rules file those modes
 * show the name only.
 */
function includeStatistic (
  sources: ReadonlyArray<{ mapType?: string, rulesFileUrl?: string }> | undefined
): boolean {
  const typed = (sources || []).filter((source) => source.mapType)
  if (!typed.length) return true
  return typed.some((source) => {
    const mode = source.mapType === 'standard' ? MapType.Travel : source.mapType
    if (mode === MapType.Heatmap) return true
    return Boolean(source.rulesFileUrl?.trim())
  })
}

function numericAttribute (value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function statisticText (label: string, value: number): string {
  const shown = Number.isInteger(value) ? value : Number(value.toFixed(2))
  return `${label}: ${shown}`
}

/** The legend's statistic as "label: value", read from the clicked graphic. */
function statisticLine (style: RuntimeStyle | null | undefined, point: FeatureClickPoint): string {
  const stats = style?.statistic
  const field = stats?.field
  const value = numericAttribute(field && point.attributes ? point.attributes[field] : undefined)
  if (value == null) return ''
  return statisticText(stats?.label || field || '', value)
}

/** The tooltip lines the audio map gives a point: the first feature's name, then its statistic. */
function pointLines (features: readonly PointFeature[], withStatistic: boolean): string[] {
  const feature = features.find((item) => item.name) ?? features[0]
  if (!feature) return []
  const lines = feature.name ? [feature.name] : []
  if (withStatistic && feature.statistic) {
    lines.push(statisticText(feature.statistic.label || feature.statistic.field, feature.statistic.value))
  }
  return lines
}

/** React's onWheel is passive, so preventDefault there only logs a warning. */
const MAP_WHEEL_LISTENER: AddEventListenerOptions = { passive: false }
/** A step recenters. The default goTo ease is the camera lag behind the indicator. */
const CAMERA_JUMP = { duration: 0 }

function mapSurfaceElement (): HTMLElement | null {
  const map = document.getElementById(AUDIOM_MAP_ELEMENT_ID)
  const view = map?.querySelector('.esri-view-surface')
  return view instanceof HTMLElement ? view : null
}

/** Replay a wheel on the Esri view so zoom works over the compass and tooltip. */
function forwardWheelToMap (event: WheelEvent): void {
  const view = mapSurfaceElement()
  if (!view || event.currentTarget === view) return
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

function bindMapWheel (node: HTMLElement | null): () => void {
  if (!node) return () => undefined
  node.addEventListener('wheel', forwardWheelToMap, MAP_WHEEL_LISTENER)
  return () => node.removeEventListener('wheel', forwardWheelToMap)
}



const PAINT_STYLE_MODES = new Set<string>(Object.values(VectorStyleMode))

/**
 * The legend's colours/patterns mode, from onStyleChanged. Default is
 * colors, matching the viewer's SettingsStore, until the runtime reports.
 */
function paintStyleMode (style: RuntimeStyle | null | undefined): VectorStyleMode {
  const mode = style?.styleMode
  return mode && PAINT_STYLE_MODES.has(mode) ? mode : VectorStyleMode.Colors
}

/** Object labels default on, matching the viewer's MapStateStore. */
function paintShowLabels (style: RuntimeStyle | null | undefined): boolean {
  return style?.labels !== false
}

/** The floor the legend selected. Null until a building level exists. */
function paintLabelLevel (style: RuntimeStyle | null | undefined): number | null {
  const level = style?.floor
  return typeof level === 'number' && Number.isFinite(level) ? level : null
}

function numericFieldType (type: string | undefined): boolean {
  const key = (type || '').toLowerCase()
  return key.includes('integer') || key.includes('double') || key.includes('single') ||
    key.includes('float') || key === 'number' || key === 'oid' ||
    key === 'small-integer' || key === 'long'
}

/** Identity, labels, and rule outputs. Not a choropleth statistic. */
const NON_STATISTIC_FIELDS = new Set([
  'objectid', 'fid', 'audiomstyle', 'id', 'name', 'state', 'updated',
  'ruletype', 'rulename', 'level', 'origid'
])

/** Floor and room-geometry columns vary, but they are not a choropleth.
 * Leaving them in made every indoor step a pitched chime. */
const FLOOR_GEOMETRY_FIELDS = new Set([
  'levelordinal', 'level_number', 'levelnumber',
  'vertical_order', 'verticalorder',
  'height_relative', 'heightrelative',
  'area_gross', 'area_net', 'areagross', 'areanet',
  'elevation', 'validationstatus', 'floor'
])

const SHAPE_MEASURE_FIELDS = new Set([
  'shape__length', 'shape__area', 'shape_length', 'shape_area',
  'st_area(shape)', 'st_length(shape)'
])

/** Same exclusions as the legend dropdown. Codes and labels are not statistics. */
function isMeasureField (field: string): boolean {
  const key = field.toLowerCase()
  if (NON_STATISTIC_FIELDS.has(key) || FLOOR_GEOMETRY_FIELDS.has(key) || SHAPE_MEASURE_FIELDS.has(key)) {
    return false
  }
  if (key.endsWith('_length') || key.endsWith('_area')) return false
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

/** Stacking inside the widget. The embed sits over the map; the compass and popup sit over that. */
const STACK = {
  map: 1,
  embed: 8,
  compass: 30,
  popup: 40
} as const

const DRAG_START_PX = 4

/** Shown until bundled mode has a web map or web scene to load. */
const SET_MAP_SOURCE_MESSAGE = 'Set a map source first.'

/**
 * The web map item lives on the data source portal, not the app portal.
 * Loading it without that URL is the CONT_0001 "item does not exist" error,
 * which leaves the map with no feature layers.
 */
type MapSourceJson = { itemId?: string, portalUrl?: string, type?: string } | null | undefined

function dataSourcesFromState (): Record<string, MapSourceJson> {
  return dataSourcesFromAppState<MapSourceJson>()
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
  const bundledHandleRef = useRef<BundledRuntimeHandle | null>(null)
  const navigationExtent = useRef<{ itemId: string, extent: [number, number, number, number] } | null>(null)
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
  if (navigationExtent.current && navigationExtent.current.itemId !== bundledMapItemId) {
    navigationExtent.current = null
  }
  void mapSourceTick
  // Empty viewpointItemId means the selected item's center is not read yet.
  // A saved config has no marker; its center belongs to the saved item.
  const viewpointReady = viewpointReadyForItem(
    bundledMapItemId,
    sanitizedConfig.viewpointItemId,
    sanitizedConfig.mapItemId
  )
  const onViewSettled = useCallback((view: { extent?: ViewExtent }) => {
    const itemId = bundledMapItemIdRef.current
    void geographicExtentOf(view).then((extent) => {
      if (!itemId || !extent) return
      if (extent[0] === extent[2] || extent[1] === extent[3]) return
      if (bundledMapItemIdRef.current !== itemId) return
      navigationExtent.current = { itemId, extent }
      void bundledHandleRef.current?.setNavigationExtent(extent).catch(logRuntimeFailure)
    })
  }, [])
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
  const soundpackName = bundledSoundpackName(
    sanitizedConfig.soundpackUrl,
    (sanitizedConfig.sourceConfigs || []).map((source) => source.mapType || MapType.Indoor)
  )
  const soundpackUrl = runtimeLocation === RuntimeLocation.Bundled
    ? resolveSoundpackUrl(soundpackName, sanitizedConfig.assetBaseUrl)
    : undefined
  const soundpackFallbackUrl = runtimeLocation === RuntimeLocation.Bundled
    ? resolveSoundpackFallbackUrl(soundpackName, sanitizedConfig.assetBaseUrl)
    : undefined
  const embedOverlay = useRef<HTMLDivElement>(null)
  const widgetBox = useRef<HTMLDivElement>(null)
  const [runtimeStyle, setRuntimeStyle] = useState<RuntimeStyle | null>(null)
  const bundledHandle = useBundledRuntime(
    runtimeLocation === RuntimeLocation.Bundled && Boolean(bundledMapItemId),
    props.id,
    embedOverlay,
    jimuMapView,
    setRuntimeStatus,
    mapSurface,
    setAvatar,
    setRuntimeStyle,
    sanitizedConfig.centerLongitude,
    sanitizedConfig.centerLatitude,
    stepSizeMeters(sanitizedConfig.stepSize, sanitizedConfig.stepSizeUnit),
    sanitizedConfig.assetBaseUrl?.trim() || DEFAULT_ASSET_BASE_URL,
    props.locale,
    soundpackUrl,
    soundpackFallbackUrl,
    (sanitizedConfig.sourceConfigs || []).map((source) => ({
      id: source.source,
      title: source.name,
      url: source.sourceUrl,
      // Embed uses the indoor default when a source omits Map Type. The Esri
      // Building config does that. Leaving it unset painted those layers as travel.
      mapType: source.mapType || MapType.Indoor,
      // Data Sources follows this eye, not the layer's visibility mid-load.
      enabled: source.enabled !== false,
      rulesFileUrl: resolveRulesFileUrl(source.rulesFileUrl, [
        sanitizedConfig.baseUrl,
        sanitizedConfig.assetBaseUrl,
        DEFAULT_CONFIG.baseUrl,
        DEFAULT_ASSET_BASE_URL
      ])
    })),
    bundledMapItemId,
    viewpointReady,
    navigationExtent,
    sanitizedConfig.showMapLabels !== false
  )
  bundledHandleRef.current = bundledHandle
  const popupGeneration = useRef(0)
  const showMapControls = sanitizedConfig.showMapControls !== false
  useEsriLegendSync(mapSurface?.view as unknown as EsriFloorView | undefined, runtimeStyle, runtimeLocation === RuntimeLocation.Bundled)
  // Only the bundled map is an Esri map other widgets can select. Standalone
  // embed is an iframe and must not publish a view. The data source id is
  // captured with the view; recreating the JimuMapView would destroy it.
  useEffect(() => {
    const view = mapSurface?.view
    if (runtimeLocation !== RuntimeLocation.Bundled || !view) return
    const sources = props.useDataSources ? Array.from(props.useDataSources) : []
    const release = publishOwnedMapView(
      props.id || props.widgetId,
      ownedMapDataSourceId(sources, dataSourcesFromState()),
      view
    )
    const surface = mapSurface
    return () => { release(surface.destroyed === true) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapSurface, props.id, props.widgetId, runtimeLocation])
  const showPopup = (point: FeatureClickPoint | null) => {
    const generation = ++popupGeneration.current
    if (!point) {
      setFeaturePopup(null)
      return
    }
    const withStatistic = includeStatistic(sanitizedConfig.sourceConfigs)
    // Esri's popup title and the painted statistic are the fallback when the
    // audio map names nothing at this point.
    const fallback = (): string[] => {
      const lines: string[] = []
      const name = point.name?.trim()
      if (name) lines.push(name)
      const stat = withStatistic ? statisticLine(bundledHandle?.style, point) : ''
      if (stat) lines.push(stat)
      return lines
    }
    const open = (lines: string[]) => {
      if (generation !== popupGeneration.current) return
      setFeaturePopup(lines.length
        ? { lines, longitude: point.longitude, latitude: point.latitude }
        : null)
    }
    if (!bundledHandle) {
      open(fallback())
      return
    }
    // The rules file's name expression is the tooltip, as the audio map has it.
    void bundledHandle.describePoint(point.longitude, point.latitude).then((features) => {
      const lines = pointLines(features, withStatistic)
      open(lines.length ? lines : fallback())
    }, () => { open(fallback()) })
  }
  // A move shows the tooltip for where the indicator landed. The runtime
  // speaks the step itself, with the statistic's pitch on a heatmap.
  const followPopup = (point: FeatureClickPoint | null) => {
    // The load report sets openPopup false. A real move sets the flag true.
    if (point?.openPopup === false) return
    showPopup(point)
  }

  // Integrated runtime is Bundled only. Legacy and Standalone take the iframe below.
  if (isIntegratedRuntime(runtimeLocation)) {
    const mapLabel = bundledStatus(bundledHandle, false)
    const scene = props.useDataSources?.some((source) =>
      String(source.dataSourceId || '').toUpperCase().includes(DataSourceTypes.WebScene)
    )
    // No item yet means there is no data-source JSON. Mounting the map
    // (or asking ExB to resolve that source) reads portalUrl off null.
    const needsMapSource = !bundledMapItemId
    return (
      <div
        className="jimu-widget"
        role="region"
        aria-label={title}
        style={styles.container}
      >
        <div ref={widgetBox} style={styles.container}>
          {needsMapSource ? (
            <p role="status" style={styles.mapSourcePrompt}>{SET_MAP_SOURCE_MESSAGE}</p>
          ) : (
          <EsriMapSurface
            mapItemId={bundledMapItemId}
            portalUrl={portalUrlForItem(props, bundledMapItemId)}
            scene={scene}
            viewpointReady={viewpointReady}
            longitude={sanitizedConfig.centerLongitude}
            latitude={sanitizedConfig.centerLatitude}
            zoom={sanitizedConfig.zoom}
            onViewSettled={onViewSettled}
            avatar={avatar}
            onMove={(direction) => {
              // The resume starts inside this key press; the step does not wait for it.
              void bundledHandle?.resumeAudio()
              void bundledHandle?.move(direction).catch(logRuntimeFailure)
            }}
            onDrop={(longitude, latitude) =>
              bundledHandle?.drop(longitude, latitude).catch((error: unknown) => {
                logRuntimeFailure(error)
                return false
              }) ?? Promise.resolve(false)}
            onSelect={() => { void bundledHandle?.focusMap().catch(logRuntimeFailure) }}
            onFeatureClick={showPopup}
            onFeatureFollow={followPopup}
            onPopupAnchor={(longitude, latitude) => {
              setFeaturePopup((current) => current ? { ...current, longitude, latitude } : current)
            }}
            onUnlock={() => bundledHandle?.resumeAudio() ?? Promise.resolve(false)}
            popup={featurePopup}
            onPopupClose={() => { setFeaturePopup(null) }}
            onSurface={setMapSurface}
          />
          )}
          <div
            ref={embedOverlay}
            className="audiom-runtime-overlay"
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'visible', zIndex: STACK.embed, pointerEvents: 'none' }}
          />
          <style>{RUNTIME_OVERLAY_CSS}</style>
          {!needsMapSource && (
            <MapControls
              view={mapSurface?.view as MapControlView | undefined}
              labels={mapControlLabels(RUNTIME_TRANSLATIONS[runtimeLocale(props.locale)])}
              indicator={avatar}
              fullscreenTarget={widgetBox.current}
              themeSource={embedOverlay.current}
              show={showMapControls}
            />
          )}
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
/** A refused call is the runtime's answer, not a widget crash. Log it and go on. */
function logRuntimeFailure (error: unknown): void {
  // eslint-disable-next-line no-console
  console.error('Audiom runtime call failed', error)
}

/**
 * The runtime's viewer sits in the overlay over the Esri map. The overlay
 * lets clicks through to the map; the viewer's own controls take them.
 */
const RUNTIME_OVERLAY_CSS = `
.audiom-runtime-overlay button,
.audiom-runtime-overlay a,
.audiom-runtime-overlay input,
.audiom-runtime-overlay select,
.audiom-runtime-overlay textarea,
.audiom-runtime-overlay [role="dialog"],
.audiom-runtime-overlay [role="menu"],
.audiom-runtime-overlay [tabindex],
.audiom-runtime-overlay aside { pointer-events: auto; }
`

/**
 * The legend is the source of truth for the Esri map: the layers the user
 * turned off are hidden, and the selected floor is the floor drawn. The
 * runtime reports both in onStyleChanged.
 */
function useEsriLegendSync (
  view: EsriFloorView | undefined,
  style: RuntimeStyle | null,
  enabled: boolean
): void {
  const styleRef = useRef(style)
  styleRef.current = style
  const floor = style?.floor ?? null
  const hiddenKey = (style?.hiddenSources || []).join('\u0000')
  const shownSources = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!enabled || !view || !styleRef.current) return
    const hidden = new Set(styleRef.current.hiddenSources)
    for (const id of hidden) setEsriLayerVisible(view.map, id, false)
    // A source the user turned back on is shown again.
    for (const id of shownSources.current) {
      if (!hidden.has(id)) setEsriLayerVisible(view.map, id, true)
    }
    shownSources.current = hidden
  }, [view, hiddenKey, enabled])
  useEffect(() => {
    if (!enabled || !view || !styleRef.current) return
    const apply = () => { void setEsriFloor(view, floor) }
    apply()
    // A web map that finishes loading its layers later gets the floor too.
    const stopLayers = onEsriLayerChange(view, apply)
    // A click must not draw a floor or a layer the legend hides, or select it.
    const stopClicks = guardFloorClicks(view)
    return () => {
      stopLayers()
      stopClicks()
    }
  }, [view, floor, enabled])
}


/** Tell the caller once the view's own viewpoint has been applied. */
function publishWhenViewSettled (
  view: MountedMapSurface['view'],
  notify: () => void
): () => void {
  let removed = false
  let watch: { remove?: () => void } | undefined
  const finish = () => {
    if (removed) return
    if (view.stationary === false && view.watch) {
      watch = view.watch('stationary', (value) => {
        if (!value || removed) return
        watch?.remove?.()
        notify()
      })
      return
    }
    notify()
  }
  if (view.when) void view.when().then(finish).catch((): void => undefined)
  else finish()
  return () => {
    removed = true
    watch?.remove?.()
  }
}

/** True when settings hold a place, not the unset 0,0 default. */
function hasMapCenter (longitude?: number, latitude?: number): boolean {
  if (longitude == null || latitude == null) return false
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false
  return !(longitude === 0 && latitude === 0)
}

function watchViewFrame (
  view: { watch?: (property: string, handler: () => void) => { remove?: () => void } },
  onChange: () => void
): () => void {
  const handles = (['extent', 'stationary', 'size'] as const).map((property) => view.watch?.(property, onChange))
  return () => {
    for (const handle of handles) handle?.remove?.()
  }
}

function EsriMapSurface (props: {
  existingMap?: unknown
  mapItemId?: string
  portalUrl?: string
  scene?: boolean
  longitude?: number
  latitude?: number
  zoom?: number
  /** False while the saved center belongs to a different item. */
  viewpointReady?: boolean
  onViewSettled?: (view: MountedMapSurface['view']) => void
  avatar?: ReportedAvatar | null
  onMove?: (direction: string) => void
  onDrop?: (longitude: number, latitude: number) => Promise<boolean>
  popup?: { lines: string[], longitude: number, latitude: number } | null
  onPopupClose?: () => void
  onSelect?: () => void
  onFeatureClick?: (point: FeatureClickPoint | null) => void
  onFeatureFollow?: (point: FeatureClickPoint | null) => void
  /** Move an open tooltip to the new step before the hit test returns. */
  onPopupAnchor?: (longitude: number, latitude: number) => void
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
  // A drop hit-tests its own pixel and announces that plot. The avatar
  // report that follows is the same landing. Do not announce it again.
  const dropLanding = useRef<ReportedAvatar | null>(null)
  const [screen, setScreen] = useState<{ x: number, y: number } | null>(null)
  const [dragScreen, setDragScreen] = useState<{ x: number, y: number } | null>(null)
  const [surfaceReady, setSurfaceReady] = useState(false)
  const [popupScreen, setPopupScreen] = useState<{ x: number, y: number } | null>(null)
  const avatar = props.avatar
  const onViewSettledRef = useRef(props.onViewSettled)
  onViewSettledRef.current = props.onViewSettled
  // The compass is the configured center until Audiom reports a position.
  // Waiting on that report is what left the map with no navigation icon.
  // While a new item's viewpoint is unread, that center is the previous map.
  const showSavedCenter = props.viewpointReady !== false
  const placed = avatar ?? (
    showSavedCenter && props.longitude != null && props.latitude != null
      ? { longitude: props.longitude, latitude: props.latitude, heading: 0 }
      : null
  )
  // A new item whose viewpoint is unread must mount now, but not at the
  // previous item's camera. Omitting center lets the web map's own
  // viewpoint set the center and the bounding box.
  const deferCamera = Boolean(props.mapItemId) && props.viewpointReady === false
  const centerReady = deferCamera || !props.mapItemId || hasMapCenter(props.longitude, props.latitude)
  // Freeze the first real center for this item. A later pan writes a new
  // center into settings; using that as the mount point would rebuild the
  // view. A different item is a different place, so its center is new.
  const mountCenter = useRef<{ itemId?: string, longitude?: number, latitude?: number, zoom?: number } | null>(null)
  if (mountCenter.current && mountCenter.current.itemId !== props.mapItemId) {
    mountCenter.current = null
  }
  if (!mountCenter.current && centerReady) {
    mountCenter.current = deferCamera
      ? { itemId: props.mapItemId }
      : {
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
    let stopSettled = (): void => undefined
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
      writeMountedSurface(node, null)
    }
    if (mountedSurface.current && sameItem) {
      surface = current
      writeMountedSurface(node, current)
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
      writeMountedSurface(node, mounted)
      mountedSurface.current = mounted
      setSurfaceReady(true)
      onSurface?.(mounted)
      stopSettled = publishWhenViewSettled(mounted.view, () => {
        if (cancelled || mountedSurface.current !== mounted) return
        onViewSettledRef.current?.(mounted.view)
      })
    }).catch(() => {
      setSurfaceReady(false)
      onSurface?.(null)
    })
    return () => {
      stopSettled()
      cancelled = true
      if (mountedSurface.current === surface) mountedSurface.current = null
      setSurfaceReady(false)
      destroyMapSurface(surface)
      writeMountedSurface(node, null)
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
    const view = readMountedSurface(container.current)?.view
    if (!view?.goTo || !surfaceReady || !avatar) return
    // The previous item's indicator must not pull the new map back to it.
    if (props.mapItemId && props.viewpointReady === false) return
    if (!hasMapCenter(avatar.longitude, avatar.latitude)) return
    void view.goTo({ center: [avatar.longitude, avatar.latitude] }, CAMERA_JUMP).catch((): void => undefined)
  }, [avatar, surfaceReady, props.mapItemId, props.viewpointReady])
  const appliedZoom = useRef<number | undefined>(undefined)
  const zoomItem = useRef(props.mapItemId)
  if (zoomItem.current !== props.mapItemId) {
    zoomItem.current = props.mapItemId
    appliedZoom.current = undefined
  }
  // Once per item, after its viewpoint is read. A later pan writes a new
  // center into settings; following that would pull the view off the indicator.
  const appliedViewpoint = useRef('')
  if (appliedViewpoint.current && appliedViewpoint.current !== props.mapItemId) {
    appliedViewpoint.current = ''
  }
  useEffect(() => {
    if (!props.mapItemId || props.viewpointReady === false) return
    if (appliedViewpoint.current === props.mapItemId) return
    if (!hasMapCenter(props.longitude, props.latitude)) return
    const view = readMountedSurface(container.current)?.view
    if (!view?.goTo || !surfaceReady) return
    appliedViewpoint.current = props.mapItemId
    appliedZoom.current = props.zoom
    const target: { center: [number, number], zoom?: number } = {
      center: [props.longitude as number, props.latitude as number]
    }
    if (typeof props.zoom === 'number' && Number.isFinite(props.zoom)) target.zoom = props.zoom
    void view.goTo(target).then(() => {
      onViewSettledRef.current?.(view)
    }).catch((): void => undefined)
  }, [props.mapItemId, props.viewpointReady, props.longitude, props.latitude, props.zoom, surfaceReady])
  useEffect(() => {
    const view = readMountedSurface(container.current)?.view
    if (!view?.goTo || !surfaceReady) return
    if (props.mapItemId && props.viewpointReady === false) return
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
  }, [props.zoom, props.mapItemId, props.viewpointReady, surfaceReady])
  useEffect(() => {
    const surface = readMountedSurface(container.current)
    if (!surface) return
    surface.onIndicatorClick = () => {
      container.current?.focus()
      onSelect?.()
    }
    surface.onFeatureClick = (point) => {
      onFeatureClick?.(point)
    }
  }, [onSelect, onFeatureClick])
  useEffect(() => {
    const surface = readMountedSurface(container.current)
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
    const unwatch = watchViewFrame(surface.view, place)
    const pointer = surface.view.on?.('pointer-move', place)
    return () => {
      cancelled = true
      unwatch()
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
    const surface = readMountedSurface(container.current)
    if (!avatar || !surface || !onFollow) return
    const view = surface.view
    if (!view.hitTest) return
    const previous = followed.current
    // The runtime reports the load position before the map can be hit-tested.
    // Recording that report makes the first real drop look like the same
    // place. A drop hit-tests its own pixel; this follow must not announce
    // that landing again. Record a position only after its screen point resolves.
    const moved = previous != null && (
      previous.longitude !== avatar.longitude || previous.latitude !== avatar.latitude
    )
    const landing = dropLanding.current
    const announced = landing != null &&
      landing.longitude === avatar.longitude &&
      landing.latitude === avatar.latitude
    if (moved && !announced) props.onPopupAnchor?.(avatar.longitude, avatar.latitude)
    if (announced) dropLanding.current = null
    if (moved) followed.current = avatar
    let cancelled = false
    // avatarScreenPoint already positions the compass; reuse it so the popup
    // lands on the same pixel. A plain toScreen object returns null in Esri.
    void avatarScreenPoint(surface, avatar).then((screen) => {
      if (cancelled || !screen) return
      followed.current = avatar
      // The compass point is in the overlay. hitTest wants the view box.
      // Using the overlay pixel misses the parcel and every step is empty.
      const viewPoint = dropViewPoint(surface, screen) ?? screen
      const emit = (data?: { name: string | null, attributes: Record<string, unknown> | null }) => {
        onFollow({
          longitude: avatar.longitude,
          latitude: avatar.latitude,
          x: screen.x,
          y: screen.y,
          name: data?.name ?? undefined,
          attributes: data?.attributes ?? undefined,
          // The load position is not spoken and must not open a tooltip.
          // A drop already announced this landing from its own hit test.
          openPopup: moved && !announced
        })
      }
      void view.hitTest?.(viewPoint).then(async (hit) => {
        if (cancelled) return
        // Only a painted pattern or color. The visual base layer is not one.
        const details = await roomUnderHit(hit)
        if (!details) { emit(); return }
        emit(details)
      }).catch(() => { if (!cancelled) emit() })
    }).catch((): void => undefined)
    return () => { cancelled = true }
    // onFollow is a stable setter; depending on it would loop on each popup set.
    // surfaceReady must be a dependency: the effect used to return before the
    // map existed and never ran again, so the first drop had no recorded
    // position and opened no tooltip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.avatar, surfaceReady])
  // The popup is pinned to the plot's geography, not a fixed pixel. Re-project
  // it on every camera change so it stays over the feature, like the compass.
  useEffect(() => {
    const anchor = props.popup
    const surface = readMountedSurface(container.current)
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
    const unwatch = watchViewFrame(surface.view, place)
    return () => {
      cancelled = true
      unwatch()
    }
  }, [props.popup, surfaceReady])
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    moveOnArrow(event, props.onMove, props.onUnlock)
  }
  // DOM-level click, independent of Esri's own click event. Clicks on the
  // Esri canvas bubble to this container; positioning is container-relative.
  const onMapClick = (event: React.MouseEvent<HTMLDivElement>) => {
    // A click on the map is a user gesture. Start the resume before the hit test.
    props.onUnlock?.()
    const surface = readMountedSurface(container.current)
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
      const details = await roomUnderHit(hit)
      if (!details) {
        emit()
        return
      }
      emit(details)
    }).catch(() => { emit() })
  }
  return (
    <div style={{ position: 'absolute', zIndex: STACK.map, top: 0, right: 0, bottom: 0, left: 0 }}>
      <div
        id={AUDIOM_MAP_ELEMENT_ID}
        ref={container}
        className="widget-map mapview-container"
        role="application"
        aria-label="Audiom map"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onClick={onMapClick}
        style={{ position: 'absolute', inset: 0 }}
      />
      <FeaturePopup popup={popupPlacement(props.popup, avatar, dragScreen ?? screen, popupScreen)} onClose={props.onPopupClose} />
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
          const surface = readMountedSurface(container.current)
          const geographic = mapPointFromScreen(surface, point)
          if (!geographic || !onDrop) {
            setDragScreen(null)
            return
          }
          // The avatar follow does not run for this drop until the report
          // comes back, and the first report is treated as the load position.
          // Hit-test the drop pixel now so the tooltip and the landing tone
          // use the painted plot instead of Empty Space.
          dropLanding.current = {
            longitude: geographic.longitude,
            latitude: geographic.latitude,
            heading: 0
          }
          const viewPoint = dropViewPoint(surface, point)
          const dropped = onDrop(geographic.longitude, geographic.latitude)
          const hit = viewPoint && surface?.view.hitTest
            ? surface.view.hitTest(viewPoint).then(async (result) => {
              return roomUnderHit(result)
            }).catch((): null => null)
            : Promise.resolve(null)
          void Promise.all([dropped, hit]).then(([, details]) => {
            props.onFeatureFollow?.({
              longitude: geographic.longitude,
              latitude: geographic.latitude,
              x: viewPoint?.x ?? point.x,
              y: viewPoint?.y ?? point.y,
              name: details?.name ?? undefined,
              attributes: details?.attributes ?? undefined,
              openPopup: true
            })
          }).finally(() => {
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
function popupPlacement (
  popup: { lines: string[], longitude: number, latitude: number } | null | undefined,
  avatar: ReportedAvatar | null | undefined,
  indicator: { x: number, y: number } | null,
  projected: { x: number, y: number } | null
): { lines: string[], x: number, y: number } | null {
  if (!popup || popup.lines.length === 0) return null
  const follows = avatar != null &&
    popup.longitude === avatar.longitude &&
    popup.latitude === avatar.latitude &&
    indicator != null
  const point = follows ? indicator : projected
  if (!point) return null
  return { lines: popup.lines, x: point.x, y: point.y }
}

function FeaturePopup (props: {
  popup: { lines: string[], x: number, y: number } | null
  onClose?: () => void
}) {
  const node = useRef<HTMLDivElement>(null)
  const open = Boolean(props.popup)
  useEffect(() => bindMapWheel(node.current), [open])
  if (!props.popup || props.popup.lines.length === 0) return null
  const lines = props.popup.lines
  return (
    <div
      ref={node}
      role="dialog"
      aria-label={lines[0]}
      style={{
        position: 'absolute',
        left: props.popup.x,
        top: props.popup.y,
        zIndex: STACK.popup,
        width: 'max-content',
        maxWidth: '18rem',
        transform: 'translate(-50%, calc(-100% - 10px))',
        padding: '0.5rem 1.75rem 0.5rem 0.75rem',
        background: '#fff',
        color: AUDIOM_NAVY,
        border: `0.125rem solid ${AUDIOM_NAVY}`,
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
          color: AUDIOM_NAVY,
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
      <span style={{ position: 'absolute', bottom: -10, left: '50%', marginLeft: -9, width: 0, height: 0, borderLeft: '9px solid transparent', borderRight: '9px solid transparent', borderTop: `10px solid ${AUDIOM_NAVY}` }} />
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
  useEffect(() => bindMapWheel(button.current), [avatar, screen])
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
    if (!active.moved && Math.hypot(dx, dy) < DRAG_START_PX) return
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
    moveOnArrow(event, props.onMove, props.onUnlock)
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        className="audiom-cursor"
        aria-label="Audiom navigation indicator"
        onKeyDown={onKeyDown}
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
          width: AUDIOM_COMPASS_SIZE,
          height: AUDIOM_COMPASS_SIZE,
          marginLeft: -AUDIOM_COMPASS_RADIUS,
          marginTop: -AUDIOM_COMPASS_RADIUS,
          padding: 0,
          border: 0,
          borderRadius: '50%',
          background: 'transparent',
          zIndex: STACK.compass,
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
  background-color: ${AUDIOM_NAVY};
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

function unmodifiedArrow (event: { key: string, shiftKey: boolean, ctrlKey: boolean, altKey: boolean, metaKey: boolean }): string | null {
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return null
  return movementDirection(event.key)
}

/**
 * Arrow keys move the avatar. Unlock inside the key event: awaiting the
 * unlock promise first plays the step tone into a suspended audio context.
 */
function moveOnArrow (
  event: {
    key: string
    shiftKey: boolean
    ctrlKey: boolean
    altKey: boolean
    metaKey: boolean
    preventDefault: () => void
    stopPropagation: () => void
  },
  onMove?: (direction: string) => void,
  onUnlock?: () => void | Promise<boolean>
): void {
  const direction = unmodifiedArrow(event)
  if (!direction || !onMove) return
  event.preventDefault()
  event.stopPropagation()
  onUnlock?.()
  onMove(direction)
}

function movementDirection (key: string): string | null {
  if (key === 'ArrowUp') return 'up'
  if (key === 'ArrowDown') return 'down'
  if (key === 'ArrowLeft') return 'left'
  if (key === 'ArrowRight') return 'right'
  return null
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
  if (sr?.isWGS84 || sr?.wkid === Wkid.Wgs84) return [xmin, ymin, xmax, ymax]
  if (!(sr?.isWebMercator || isWebMercatorWkid(sr?.wkid))) {
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

/**
 * The center a bundled session may be born at. 0,0 is the unset default,
 * not a place, so it must not become the projection origin. A later pan
 * writes a new center into settings; that is the same session, not a new
 * origin, and must not restart it.
 */
function sessionOriginKey (longitude?: number, latitude?: number): string {
  return hasMapCenter(longitude, latitude) ? 'placed' : ''
}

function useBundledRuntime (
  enabled: boolean,
  instanceId: string,
  /** The overlay the runtime mounts its viewer into. */
  overlay: { current: HTMLDivElement | null },
  jimuMapView: JimuMapView | undefined,
  onStatus: (status: string) => void,
  surface: MountedMapSurface | null,
  onAvatar: (position: ReportedAvatar | null) => void,
  onStyle: (style: RuntimeStyle | null) => void,
  longitude?: number,
  latitude?: number,
  moveDistance?: number,
  assetBase?: string,
  locale?: string,
  soundpackUrl?: string,
  soundpackFallbackUrl?: string,
  mapTypes?: readonly SnapshotMapTypeHint[],
  mapItemId?: string,
  viewpointReady = true,
  navigationExtent?: { current: { itemId: string, extent: [number, number, number, number] } | null },
  showMapLabels = true
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
  // Settings can hide the room-name overlay without re-querying the map.
  // Absent config means shown, matching the settings default.
  const showMapLabelsRef = useRef(showMapLabels)
  showMapLabelsRef.current = showMapLabels
  // A rules file change must re-query so the new outputs replace the stamps.
  const rulesKey = (mapTypes || []).map((item) => item.rulesFileUrl || '').join('|')
  // A Source Configuration eye change must re-query. Hiding Units in settings
  // and leaving it open in Data Sources is the bug this key refreshes.
  const visibilityKey = (mapTypes || []).map((item) =>
    `${item.id || item.title || item.url || ''}:${item.enabled === false ? '0' : item.enabled === true ? '1' : ''}`
  ).join('|')
  const loadedSnapshot = useRef<MapSnapshot | null>(null)
  // Repaint the loaded snapshot with the legend's current style. Set by the
  // snapshot effect; called on onStyleChanged and on the labels setting.
  const repaint = useRef<(() => void) | null>(null)
  // The Map Type effect republishes this snapshot into a new session. A map
  // switch must drop it first, or Data Sources keeps the previous item's layers.
  const snapshotItemId = useRef(mapItemId)
  if (snapshotItemId.current !== mapItemId) {
    snapshotItemId.current = mapItemId
    loadedSnapshot.current = null
  }
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
  // An unread viewpoint still holds the previous item's center. Starting
  // the session there reports that point, and the new map follows it.
  const originKey = viewpointReady ? sessionOriginKey(longitude, latitude) : ''
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
    if (!enabled || !originKey) {
      setHandle(null)
      setReported(null)
      onAvatar(null)
      return
    }
    // Wait for the map center. A session born at 0,0 reports the ocean
    // for the rest of its life, and the map then follows that point.
    bornCenter.current = {
      longitude: longitudeRef.current,
      latitude: latitudeRef.current
    }
    const container = overlay.current
    if (!container) return
    const next = startBundledRuntime({
      instanceId: mapItemId ? `${instanceId}:${mapItemId}` : instanceId,
      container,
      onStatus,
      // The map opens at the configured centre, not the centre of the data.
      start: { longitude: longitudeRef.current, latitude: latitudeRef.current },
      stepSize: moveDistanceRef.current,
      assetBase,
      soundpackUrl,
      soundpackFallbackUrl,
      locale
    })
    next.bindSurface(surface)
    next.onReported = (position) => {
      reportedRef.current = position
      onAvatar(position)
    }
    next.onStyle = (style) => {
      onStyle(style)
      repaint.current?.()
    }
    setHandle(next)
    return () => {
      restoreAudiomStyles(jimuMapView)
      setReported(null)
      onAvatar(null)
      onStyle(null)
      // Destroyed tears the viewer down, with its sounds.
      void next.dispose().catch(logRuntimeFailure)
    }
    // locale and assetBase are read when the runtime starts; changing them is not a restart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, instanceId, mapItemId, originKey, jimuMapView, onStatus, onAvatar, onStyle, soundpackUrl, soundpackFallbackUrl, overlay])
  // The view can settle before the runtime exists. Apply that extent once
  // it is there, so the new map's fence is not the old one.
  useEffect(() => {
    const settled = navigationExtent?.current
    if (!handle || !settled || !mapItemId) return
    if (settled.itemId !== mapItemId) return
    void handle.setNavigationExtent(settled.extent).catch(logRuntimeFailure)
  }, [handle, mapItemId, navigationExtent])
  // Step size is not a session restart. The start reads it once; a later
  // settings write has to reach the live avatar or the next arrow key still
  // uses the distance from when the map loaded.
  useEffect(() => {
    if (!handle) return
    if (moveDistance == null || !Number.isFinite(moveDistance) || moveDistance <= 0) return
    void handle.setStepSize(moveDistance).catch(logRuntimeFailure)
  }, [handle, moveDistance])
  useEffect(() => {
    handle?.bindSurface(surface)
  }, [handle, surface])
  // A typed Center is a new place: restore the avatar there. The point the
  // session was born at is not a move: a pan writes that same center back,
  // and following it would drag the indicator.
  useEffect(() => {
    if (!handle) return
    if (!hasMapCenter(longitude, latitude)) return
    const born = bornCenter.current
    if (born && born.longitude === longitude && born.latitude === latitude) return
    bornCenter.current = { longitude, latitude }
    // The runtime reports the restored position through onAvatarChanged.
    void handle.place(longitude as number, latitude as number).catch(logRuntimeFailure)
  }, [handle, longitude, latitude])
  // The indicator starts at the set map's center. A pan must not move it.
  // A typed center does, through place above. Drag and keyboard report
  // through onReported rather than through this config.
  useEffect(() => {
    const drawn = surface?.view?.map || jimuMapView?.view?.map
    const map = drawn as {
      when?: () => Promise<unknown>
      allLayers?: {
        forEach: (fn: (layer: unknown) => void) => void
        on?: (eventName: string, handler: () => void) => { remove?: () => void }
      }
    } | undefined
    if (!handle || !map) return
    let cancelled = false
    let layerHandle: { remove?: () => void } | undefined
    const drawnView = (surface?.view || jimuMapView?.view) as { extent?: ViewExtent, map?: unknown, graphics?: unknown } | undefined
    // view is the MapView, so room names can be drawn in view.graphics
    // above every layer. map alone is the fallback for the layer walk.
    const view = { map, view: drawnView }
    const paintChoice = async (snapshot: MapSnapshot) => {
      const style = handle.style
      // The legend's field. A placeholder such as casesPerOneMillion is not in
      // the catalog, so it is not a selection. Count only columns the dropdown
      // lists. The first of those is ramp 0 on the first paint and after a
      // statistic change.
      const published = catalogFields(snapshot.queriedLayers)
      const chosen = published.includes(style?.statistic?.field || '')
        ? style?.statistic?.field
        : published[0]
      // Default is colors, matching the viewer's SettingsStore, not both.
      const mode = paintStyleMode(style)
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
        snapshot.sources.length === 1 ? snapshot.sources[0].mapType : undefined,
        showMapLabelsRef.current && paintShowLabels(style),
        paintLabelLevel(style)
      )
    }
    const apply = async () => {
      // Do not await view.when() or map.when(). A portal item that the
      // portal cannot see leaves those promises pending, and the legend
      // then never reads the layers that did load.
      // Query the whole service. Passing the drawn extent makes the page
      // the current view, and the next snapshot then drops the indicator
      // onto whichever plot is nearest in that page. The standing point is
      // still merged in, so the room under the compass is not left off the
      // first page. Indoor layers page past that cap on their own.
      const reported = reportedRef.current
      const standingLongitude = reported?.longitude ?? longitudeRef.current
      const standingLatitude = reported?.latitude ?? latitudeRef.current
      const indicator = Number.isFinite(standingLongitude) && Number.isFinite(standingLatitude)
        ? { longitude: standingLongitude as number, latitude: standingLatitude as number }
        : undefined
      const snapshot = await snapshotFeaturesFromMapView(
        view, instanceId, mapTypesRef.current, undefined, indicator, handle.evaluate
      )
      // A switch drops this query. Publishing it would put the previous
      // item's layers back into Data Sources after the new map had loaded.
      const stillThisMap = () => !cancelled && snapshotItemId.current === mapItemId
      if (!stillThisMap()) return
      // Record the snapshot before any further async step so a pattern/color
      // repaint, or a Map Type change, has it without querying again.
      loadedSnapshot.current = snapshot
      // The navigation wall is the whole drawn map, not the bbox of the
      // features that loaded. A settled view extent from the new item wins
      // over a read taken before that item's viewpoint was applied.
      const settled = navigationExtent?.current
      const extent = settled && settled.itemId === mapItemId
        ? settled.extent
        : await geographicExtentOf(drawnView)
      if (!stillThisMap()) return
      // The runtime keeps the fence across snapshots, and applies it when
      // its map opens.
      if (extent) await handle.setNavigationExtent(extent)
      // Paint before publish. The publish can reject, and waiting on it left
      // the host renderer in place so the first load had no Audiom colors.
      await paintChoice(snapshot)
      if (!stillThisMap()) return
      await handle.replaceSources(snapshot)
      if (!stillThisMap()) return
      // A viewpoint that settled while the query was running replaces the
      // extent captured at the start of that query.
      const latestExtent = navigationExtent?.current
      if (latestExtent && latestExtent.itemId === mapItemId && latestExtent.extent !== extent) {
        await handle.setNavigationExtent(latestExtent.extent)
      }
      // The first map reports the legend's statistic. Paint that field too.
      // A failed paint keeps the renderer just applied.
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
    repaint.current = () => {
      const loaded = loadedSnapshot.current
      if (!loaded) return
      void paintChoice(loaded).catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.error('Audiom repaint failed', error)
      })
    }
    return () => {
      cancelled = true
      layerHandle?.remove?.()
      repaint.current = null
    }
  }, [handle, jimuMapView, surface, instanceId, rulesKey, visibilityKey])
  // The snapshot effect must not depend on this switch. Toggling it only
  // redraws the names already loaded.
  const sawMapLabels = useRef(showMapLabels)
  useEffect(() => {
    if (sawMapLabels.current === showMapLabels) return
    sawMapLabels.current = showMapLabels
    repaint.current?.()
  }, [showMapLabels])
  // Map Type is audio and the legend, not a new query. Retag the snapshot
  // already loaded and publish that. Querying the service again is the
  // long pause after the dropdown changes.
  const mapTypeKey = (mapTypes || []).map((item) => `${item.id || ''}:${item.mapType || ''}`).join('|')
  useEffect(() => {
    const loaded = loadedSnapshot.current
    if (!handle || !mapTypeKey || !loaded) return
    // Handle identity changes on a map switch. The snapshot above is the
    // previous item until the new query lands; publishing it restores the
    // old Data Sources on the new map.
    if (snapshotItemId.current !== mapItemId) return
    const hints = mapTypesRef.current || []
    const retagged: MapSnapshot = {
      ...loaded,
      sources: loaded.sources.map((source) => {
        const hint = hints.find((item) => item.id === source.id) ||
          (hints.length === 1 ? hints[0] : undefined)
        const raw = hint?.mapType
        // The contract names Travel `standard`.
        const next = raw === 'heatmap' || raw === 'indoor' ? raw : 'standard'
        return next === source.mapType ? source : { ...source, mapType: next }
      })
    }
    loadedSnapshot.current = retagged
    const style = handle.style
    const drawn = drawnMapRef.current
    const paint = drawn
      ? paintAudiomStyles(
        { map: drawn },
        retagged,
        paintStyleMode(style),
        style?.statistic?.field,
        undefined,
        retagged.sources.length === 1 ? retagged.sources[0].mapType : undefined,
        showMapLabelsRef.current && paintShowLabels(style),
        paintLabelLevel(style)
      )
      : Promise.resolve()
    const publishedItemId = mapItemId
    void paint.then(() => {
      if (snapshotItemId.current !== publishedItemId) return undefined
      return handle.replaceSources(retagged)
    }).catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('Audiom map type update failed', error)
    })
  }, [handle, mapItemId, mapTypeKey])
  useEffect(() => {
    if (!surface || !reported) return
    void showAvatar(surface, reported)
  }, [surface, reported])
  return handle
}

export default Widget
