import {
  CONTRACT_VERSION,
  type AppliedResult,
  type AvatarState,
  type CanonicalKey,
  type ContractError,
  FocusTarget,
  type FocusResult,
  type SelectionResult,
  type Viewpoint
} from '../../../../shared/audiom-runtime/src/types'
import {
  createInProcessRuntime,
  type InProcessRuntime
} from '../../../../shared/audiom-runtime/src/factory'
import { embedLabelStyle } from './embedLabelPlacement'
import { AUDIOM_LABEL_LAYER_ID, labelsForFeatures, labelSymbolPaint, thinLabels, type LabelFeature, type LabelGraphicSpec, type ScreenLabel } from './audiomLabels'
import { applyAudiomLabels, applyAudiomSymbols, restoreAudiomLabels, restoreAudiomSymbols, VectorStyleMode, type LabelLayer, type SymbolLayer, type SymbolModules } from './audiomSymbols'
import { FALLBACK_LAYER_SOURCE_ID, snapshotFeaturesFromMapView, type SnapshotLayer, type SnapshotMapView } from './mapSnapshot'
import type { MapSnapshot } from '../../../../shared/audiom-runtime/src/types'
import { showAvatar, type MountedMapSurface } from './esriMapSurface'
import { audiomProgramError, createAudiomProgram, type AudiomProgram } from './audiomProgram'

export interface BundledRuntimeHandle {
  runtime: InProcessRuntime
  appliedSources: number
  lastError: string
  avatar: AvatarState | null
  /** True only after Audiom reports a position. The widget never invents one. */
  reported: boolean
  /** Called only when Audiom reports a new avatar state. */
  onReported?: (state: AvatarState) => void
  /** True when Audiom asked the host to unlock audio. */
  activationRequired: boolean
  /** The compiled Audiom program, when it loaded. */
  program: AudiomProgram | null
  /** The map mounted after this runtime started. Go pans this view. */
  bindSurface?: (surface: MountedMapSurface | null) => void
  /**
   * Drop the navigation indicator. True when Audiom accepted the point.
   * A blocked drop leaves the avatar where it was.
   */
  dropAvatar?: (longitude: number, latitude: number) => Promise<boolean>
}

const applied = (revision = 0): AppliedResult => ({ applied: true, revision })

/** Runs the runtime package in this widget. The Esri map stays the map. */
export function startBundledRuntime (
  instanceId: string,
  jimuMapView: SnapshotMapView | undefined,
  onStatus: (status: string) => void,
  surface: MountedMapSurface | null = null,
  origin?: { longitude?: number, latitude?: number, moveDistance?: number, soundpackUrl?: string, soundpackFallbackUrl?: string }
): BundledRuntimeHandle {
  const handle: BundledRuntimeHandle = {
    runtime: null as unknown as InProcessRuntime,
    appliedSources: 0,
    lastError: '',
    avatar: null,
    reported: false,
    activationRequired: false,
    program: null
  }
  let program: AudiomProgram | null = null
  // The map is mounted after this runtime starts. Go reads the surface that
  // exists at report time, not the null passed into startBundledRuntime.
  let drawnSurface = surface
  const host = {
    onAvatarChanged (state: AvatarState) {
      handle.avatar = state
      handle.reported = true
      handle.onReported?.(state)
      const mapSurface = drawnSurface
      void showAvatar(mapSurface, {
        longitude: state.position.longitude,
        latitude: state.position.latitude,
        heading: state.orientation
      })
      // The indicator is a geographic point. Panning or zooming the map
      // must not move it, and a report must not recenter the map on it.
      // Audiom's marker only changes on drag, keyboard, or menu movement.
      return Promise.resolve(applied())
    },
    requestSelection () {
      const result: SelectionResult = { accepted: true, revision: 1 }
      return Promise.resolve(result)
    },
    requestViewpoint (viewpoint: Viewpoint) {
      onStatus(`Viewpoint ${viewpoint.center.longitude}, ${viewpoint.center.latitude}`)
      return Promise.resolve(applied())
    },
    requestHostFocus () {
      const result: FocusResult = { focused: true, blocked: false }
      return Promise.resolve(result)
    },
    onFocusChanged () { return Promise.resolve(applied()) },
    onActivationRequired () {
      handle.activationRequired = true
      onStatus('Select the map to turn sound on')
      return Promise.resolve(applied())
    },
    onFeatureEntered (keys: CanonicalKey[]) {
      onStatus(keys.length ? `Entered ${keys.length}` : 'Entered')
      return Promise.resolve(applied())
    },
    onFeatureExited () { return Promise.resolve(applied()) },
    onRuntimeStatus (status: string) {
      onStatus(status)
      return Promise.resolve(applied())
    },
    onRuntimeError (error: ContractError) {
      handle.lastError = error.message
      onStatus(error.message)
      return Promise.resolve(applied())
    }
  }
  handle.bindSurface = (next) => {
    drawnSurface = next
  }
  handle.dropAvatar = async (longitude, latitude) => {
    const dropped = program?.dropAvatar?.(longitude, latitude) ?? null
    if (!dropped) return false
    await handle.runtime.notifyAvatarChanged(dropped)
    return true
  }
  program = createAudiomProgram({
    instanceId,
    longitude: origin?.longitude,
    latitude: origin?.latitude,
    moveDistance: origin?.moveDistance,
    soundpackUrl: origin?.soundpackUrl,
    soundpackFallbackUrl: origin?.soundpackFallbackUrl
  }, host)
  handle.program = program
  if (program) {
    handle.runtime = program.runtime
  } else {
    handle.lastError = audiomProgramError() || 'Audiom program failed to load'
    // eslint-disable-next-line no-console
    console.error('Audiom program failed to load:', handle.lastError)
    handle.runtime = createInProcessRuntime({
      sessionId: `${instanceId}-session`,
      instanceId,
      moveAvatar () {
        return null
      }
    }, host)
    onStatus(handle.lastError)
  }
  void handle.runtime.hello({
    product: 'Experience Builder',
    version: '1.18',
    contractVersion: CONTRACT_VERSION,
    capabilities: ['existing-map']
  }).then(async () => {
    const start = program?.avatarState?.()
    if (start) await handle.runtime.notifyAvatarChanged(start)
    if (program?.loadSoundpack) {
      try {
        await program.loadSoundpack()
        if (program.audioLocked?.()) {
          handle.activationRequired = true
          onStatus('Select the map to turn sound on')
        }
      } catch (error) {
        // A missing pack must not cancel the feature snapshot below.
        // eslint-disable-next-line no-console
        console.error('Audiom soundpack failed', error)
      }
    }
    const snapshot = await snapshotFeaturesFromMapView(jimuMapView, instanceId)
    // This hello view is not the drawn map. An empty replace lands after the
    // widget's plots and the next step then says Empty Space.
    if (!snapshot.sources.length) return applied(0)
    // Do not paint here. This path has no field and no property order, so
    // it colored the map with a different ramp than the legend.
    return handle.runtime.replaceSources(snapshot, 1)
  }).then((result) => {
    handle.appliedSources = result.revision
    onStatus(program ? 'Using the existing map' : handle.lastError)
  }).catch((error: unknown) => {
    handle.lastError = error instanceof Error ? error.message : 'Runtime failed'
    onStatus(handle.lastError)
  })
  return handle
}

export function bundledStatus (
  handle: BundledRuntimeHandle | null,
  waiting: boolean
): string {
  if (handle?.lastError) return handle.lastError
  if (waiting) return 'Waiting for the existing map'
  if (!handle) return 'Starting Audiom'
  return `Using the existing map (${handle.runtime.snapshot?.sources.length ?? 0} layers)`
}

export const bundledFocusTarget = FocusTarget.Map

/**
 * Paint Audiom fill, stroke, width, opacity, dash, and pattern onto layers
 * already on the Esri map, and the room-name text the embed draws on top.
 * Names are text graphics. Esri's labeling engine did not draw them.
 * No-op when the map has no styled features or the symbol modules are absent.
 * Host renderers are saved and restored on unmount.
 */
export async function paintAudiomStyles (
  jimuMapView: SnapshotMapView | undefined,
  snapshot?: MapSnapshot,
  mode: VectorStyleMode = VectorStyleMode.Both,
  field?: string,
  paletteIndex?: number,
  mapType?: string,
  showLabels = true,
  level?: number | null
): Promise<void> {
  const layers = jimuMapView?.view?.map?.allLayers || jimuMapView?.map?.allLayers
  if (!layers || !snapshot) return
  const queried = (snapshot as MapSnapshot & { queriedLayers?: SnapshotLayer[] }).queriedLayers || []
  const specs: LabelGraphicSpec[] = []
  layers.forEach((layer) => {
    const sourceId = layer.id || layer.title || FALLBACK_LAYER_SOURCE_ID
    const match = queried.find((item) => (item.id || item.title || FALLBACK_LAYER_SOURCE_ID) === sourceId)
    const title = (match?.title || layer.title || '').trim().toLowerCase()
    // Sites is "Esri Redlands Main Campus". That web-map title is not a room.
    const catalog = Boolean(match?.floorCatalog) ||
      title === 'sites' || title === 'facilities' || title === 'levels' || title === 'details'
    if (!match && !catalog) return
    applyAudiomLabels(layer as LabelLayer, mode, false, { floorCatalog: catalog })
    if (!showLabels || !match || catalog) return
    specs.push(...labelsForFeatures(match.features, level ?? null, {
      roomLayer: title === 'units' || title.includes('unit')
    }))
  })
  // The query copy can lose its rings. Ruled or unit records still have the
  // room name and a geographic shape. A site record has neither a use type
  // nor a rules name, so it is not a caption.
  if (showLabels && !specs.length) {
    specs.push(...labelsForFeatures(snapshot.records.filter((record) => {
      const attributes = record.attributes
      return attributes.ruleType || attributes.ruleName || attributes.USE_TYPE ||
        attributes.use_type || attributes.levelOrdinal != null
    }).map((record) => ({
      attributes: record.attributes,
      geometry: record.geometry ?? undefined
    })), level ?? null))
  }
  // The snapshot often has no rings. The Units layer on the view does, and
  // its floor filter is the level actually drawn. Prefer that.
  if (showLabels) {
    const live = await labelsFromMap(jimuMapView, level ?? null)
    if (live) specs.splice(0, specs.length, ...live)
  }
  bindLabelZoom(jimuMapView, (requery) => {
    void refreshRoomLabels(jimuMapView, mode, showLabels, level ?? null, requery)
  })
  // Labels do not wait on the fill symbols. A symbol-module failure must
  // not leave the room names off the map.
  const labels = drawAudiomLabels(jimuMapView, specs, mode, showLabels)
  let modules: SymbolModules
  try {
    const loaded = await import('jimu-core').then((jimu) =>
      jimu.loadArcGISJSAPIModules([
        'esri/symbols/SimpleFillSymbol',
        'esri/symbols/SimpleLineSymbol',
        'esri/symbols/SimpleMarkerSymbol',
        'esri/renderers/UniqueValueRenderer',
        'esri/symbols/PictureFillSymbol',
        'esri/renderers/ClassBreaksRenderer',
        'esri/renderers/SimpleRenderer'
      ])
    ) as unknown[]
    modules = {
      SimpleFillSymbol: loaded[0] as SymbolModules['SimpleFillSymbol'],
      SimpleLineSymbol: loaded[1] as SymbolModules['SimpleLineSymbol'],
      SimpleMarkerSymbol: loaded[2] as SymbolModules['SimpleMarkerSymbol'],
      UniqueValueRenderer: loaded[3] as SymbolModules['UniqueValueRenderer'],
      PictureFillSymbol: loaded[4] as new (properties: unknown) => unknown,
      ClassBreaksRenderer: loaded[5] as SymbolModules['ClassBreaksRenderer'],
      SimpleRenderer: loaded[6] as SymbolModules['SimpleRenderer']
    }
  } catch {
    await labels
    return
  }
  // Do not restore before painting. Restoring assigns the host renderer
  // back, which is the flash of the original Esri colors. Unmount restores.
  layers.forEach((layer) => {
    const sourceId = layer.id || layer.title || FALLBACK_LAYER_SOURCE_ID
    const match = queried.find((item) => (item.id || item.title || FALLBACK_LAYER_SOURCE_ID) === sourceId)
    const matched = match as (SnapshotLayer & { features?: Array<{ attributes?: Record<string, unknown> }> }) | undefined
    const features = matched?.features
    if (!features?.length) return
    const paintable = layer as SymbolLayer
    if (!paintable.objectIdField && matched?.objectIdField) {
      paintable.objectIdField = matched.objectIdField
    }
    const extents = (matched as { fieldExtents?: Record<string, { min: number, max: number }> } | undefined)?.fieldExtents
    const source = snapshot.sources.find((item) =>
      item.sourceId === sourceId || item.sourceId === layer.id || item.displayName === layer.title
    )
    const layerType = source?.mapType || mapType
    const rulesApplied = Boolean(matched?.rulesRef)
    applyAudiomSymbols(
      paintable, modules, features, mode, field, extents, paletteIndex, layerType, rulesApplied
    )
  })
  await labels
}

interface LabelDrawLayer {
  id?: string
  visible?: boolean
  removeAll?: () => void
  add?: (graphic: unknown) => void
  addMany?: (graphics: unknown[]) => void
  destroy?: () => void
}

interface LabelScreenGraphic {
  attributes?: { audiomLabel?: boolean }
}

interface LabelScreenGraphics {
  add?: (graphic: unknown) => void
  remove?: (graphic: unknown) => void
  forEach?: (fn: (graphic: LabelScreenGraphic) => void) => void
}

interface LabelDrawMap {
  add?: (layer: unknown) => void
  remove?: (layer: unknown) => void
  layers?: {
    add?: (layer: unknown, index?: number) => void
    remove?: (layer: unknown) => void
    reorder?: (layer: unknown, index: number) => void
    length?: number
    forEach?: (fn: (layer: LabelDrawLayer) => void) => void
  }
  allLayers?: { forEach: (fn: (layer: LabelDrawLayer) => void) => void }
}

function labelMap (jimuMapView: SnapshotMapView | undefined): LabelDrawMap | undefined {
  return (jimuMapView?.view?.map || jimuMapView?.map) as LabelDrawMap | undefined
}

function labelScreen (jimuMapView: SnapshotMapView | undefined): LabelScreenGraphics | undefined {
  return (jimuMapView?.view as { graphics?: LabelScreenGraphics } | undefined)?.graphics
}

interface LabelZoomView {
  zoom?: number
  width?: number
  height?: number
  spatialReference?: { wkid?: number }
  center?: { spatialReference?: { wkid?: number } }
  extent?: { xmin?: number, ymin?: number, xmax?: number, ymax?: number }
  rotation?: number
  stationary?: boolean
  toScreen?: (point: unknown) => { x: number, y: number } | null
  watch?: (property: string, callback: (value: unknown) => void) => { remove?: () => void }
  whenLayerView?: (layer: unknown) => Promise<{ filter?: { where?: string } }>
  map?: {
    allLayers?: {
      forEach: (fn: (layer: RoomQueryLayer) => void) => void
    }
  }
  __audiomLabelZoom?: { remove?: () => void }
  __audiomLabelRedraw?: (requery: boolean) => void
  __audiomLabelToken?: number
  __audiomScreenTries?: number
  __audiomLabelLater?: boolean
  __audiomRoomFeatures?: LabelFeature[]
  __audiomFloorFiltered?: boolean
}

interface RoomQueryLayer {
  id?: string
  title?: string
  type?: string
  visible?: boolean
  createQuery?: () => RoomQuery
  queryFeatures?: (query: RoomQuery) => Promise<{ features?: LabelFeature[] }>
}

interface RoomQuery {
  where?: string
  geometry?: unknown
  spatialRelationship?: string
  returnGeometry?: boolean
  outFields?: string[]
  outSpatialReference?: { wkid: number }
}

function readLabelZoom (jimuMapView: SnapshotMapView | undefined): number {
  const zoom = (jimuMapView?.view as LabelZoomView | undefined)?.zoom
  return typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : Number.NaN
}

function labelView (jimuMapView: SnapshotMapView | undefined): LabelZoomView | undefined {
  return jimuMapView?.view as LabelZoomView | undefined
}

function roomLayerTitle (title: string | undefined): boolean {
  const key = (title || '').trim().toLowerCase()
  return key === 'units' || key.includes('unit')
}

/**
 * Room captions from the layer that is on screen. The floor filter is the
 * level the map is drawing, so other floors do not stack on the same rooms.
 * Null when this map has no Units layer and the snapshot path should run.
 */
async function labelsFromMap (
  jimuMapView: SnapshotMapView | undefined,
  level: number | null
): Promise<LabelGraphicSpec[] | null> {
  const view = labelView(jimuMapView)
  const layers = view?.map?.allLayers
  if (!view || !layers) return null
  const rooms: RoomQueryLayer[] = []
  const catalogs: RoomQueryLayer[] = []
  layers.forEach((layer) => {
    const title = (layer.title || '').trim().toLowerCase()
    if (layer.type !== 'feature' || typeof layer.queryFeatures !== 'function') return
    if (title === 'levels') catalogs.push(layer)
    if (roomLayerTitle(layer.title) && layer.visible !== false) rooms.push(layer)
  })
  if (!rooms.length) return null
  const levelName = new Map<string, string>()
  const levelOrdinal = new Map<string, number>()
  for (const catalog of catalogs) {
    try {
      const query = catalog.createQuery?.()
      if (!query) continue
      query.where = '1=1'
      query.returnGeometry = false
      query.outFields = ['LEVEL_ID', 'NAME', 'VERTICAL_ORDER']
      const result = await catalog.queryFeatures?.(query)
      for (const feature of result?.features || []) {
        const attributes = feature.attributes || {}
        const id = textAttribute(attributes.LEVEL_ID).toUpperCase()
        if (!id) continue
        const name = textAttribute(attributes.NAME)
        if (name) levelName.set(id, name)
        const order = attributes.VERTICAL_ORDER
        if (typeof order === 'number' && Number.isFinite(order)) levelOrdinal.set(id, order)
      }
    } catch {
      // A missing catalog still leaves the room NAME as the caption.
    }
  }
  const zoom = readLabelZoom(jimuMapView)
  const features: LabelFeature[] = []
  let floorFiltered = false
  for (const layer of rooms) {
    try {
      const layerView = view.whenLayerView ? await view.whenLayerView(layer) : undefined
      const floorWhere = layerView?.filter?.where
      if (floorWhere) floorFiltered = true
      const query = layer.createQuery?.()
      if (!query) continue
      query.where = floorWhere || '1=1'
      query.returnGeometry = true
      query.outFields = ['*']
      query.outSpatialReference = { wkid: 4326 }
      const result = await layer.queryFeatures?.(query)
      for (const feature of result?.features || []) {
        const attributes = { ...(feature.attributes || {}) }
        const id = textAttribute(attributes.LEVEL_ID).toUpperCase()
        if (!attributes.levelName && id && levelName.has(id)) attributes.levelName = levelName.get(id)
        if (attributes.levelOrdinal == null && id && levelOrdinal.has(id)) {
          attributes.levelOrdinal = levelOrdinal.get(id)
        }
        features.push({ attributes, geometry: feature.geometry })
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Audiom room labels skipped', layer.title || layer.id, error)
    }
  }
  view.__audiomRoomFeatures = features
  view.__audiomFloorFiltered = floorFiltered
  return placeRoomFeatures(view, level)
}

function placeRoomFeatures (view: LabelZoomView, level: number | null): LabelGraphicSpec[] {
  return labelsForFeatures(view.__audiomRoomFeatures || [], view.__audiomFloorFiltered ? null : level, {
    roomLayer: true,
    strictLevel: true
  })
}

function textAttribute (value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return typeof value === 'string' ? value.trim() : ''
}

async function refreshRoomLabels (
  jimuMapView: SnapshotMapView | undefined,
  mode: VectorStyleMode,
  showLabels: boolean,
  level: number | null,
  requery: boolean
): Promise<void> {
  const view = labelView(jimuMapView)
  if (!view) return
  if (!showLabels) {
    await drawAudiomLabels(jimuMapView, [], mode, false)
    return
  }
  // Zoom changes the band and which names fit. Re-place the rooms already
  // loaded so names appear and disappear during the zoom, not after a query.
  if (!requery && view.__audiomRoomFeatures) {
    await drawAudiomLabels(jimuMapView, placeRoomFeatures(view, level), mode, true)
    return
  }
  const token = (view.__audiomLabelToken || 0) + 1
  view.__audiomLabelToken = token
  const live = await labelsFromMap(jimuMapView, level)
  if (view.__audiomLabelToken !== token || live == null) return
  await drawAudiomLabels(jimuMapView, live, mode, showLabels)
}

function bindLabelZoom (
  jimuMapView: SnapshotMapView | undefined,
  redraw: (requery: boolean) => void
): void {
  const view = labelView(jimuMapView)
  if (!view?.watch) return
  view.__audiomLabelRedraw = redraw
  // Rebind every paint. A watch requested before the view can notify never
  // fires again, which left the names stuck at the zoom they were drawn at.
  view.__audiomLabelZoom?.remove?.()
  let timer = 0
  let requery = false
  const schedule = (nextRequery: boolean) => {
    requery = requery || nextRequery
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      const query = requery
      requery = false
      view.__audiomLabelRedraw?.(query)
    }, 60)
  }
  const zoomHandle = view.watch('zoom', () => schedule(false))
  const stillHandle = view.watch('stationary', (value: unknown) => {
    if (value) schedule(true)
  })
  // The first extent is not the settled view. Place again once it is.
  // Rebinding the zoom watch must not cancel these.
  if (!view.__audiomLabelLater) {
    view.__audiomLabelLater = true
    ;[1000, 3000].forEach((delay) => {
      window.setTimeout(() => view.__audiomLabelRedraw?.(false), delay)
    })
  }
  view.__audiomLabelZoom = {
    remove: () => {
      window.clearTimeout(timer)
      zoomHandle?.remove?.()
      stillHandle?.remove?.()
    }
  }
}

function clearLabelZoom (jimuMapView: SnapshotMapView | undefined): void {
  const view = labelView(jimuMapView)
  view?.__audiomLabelZoom?.remove?.()
  if (view) {
    view.__audiomLabelZoom = undefined
    view.__audiomLabelRedraw = undefined
  }
}

/** Geographic point. A plain spatial reference is what MapView.toScreen projects. */
function pointForView (
  Point: new (properties: unknown) => unknown,
  longitude: number,
  latitude: number
): unknown {
  return new Point({
    longitude,
    latitude,
    spatialReference: { wkid: 4326 }
  })
}

function screenPoint (
  view: LabelZoomView,
  longitude: number,
  latitude: number
): { x: number, y: number } | null | undefined {
  // MapView.toScreen of a plain point returns longitude*100 until the view
  // has been moved, which culled every room. The extent is already in the
  // view's projection, so map that instead.
  const extent = view.extent
  const width = view.width
  const height = view.height
  if (
    extent && typeof extent.xmin === 'number' && typeof extent.xmax === 'number' &&
    typeof extent.ymin === 'number' && typeof extent.ymax === 'number' &&
    typeof width === 'number' && typeof height === 'number' &&
    extent.xmax !== extent.xmin && extent.ymax !== extent.ymin &&
    !view.rotation
  ) {
    const mercator = Math.abs(extent.xmin) > 180 || Math.abs(extent.xmax) > 180
    const origin = 20037508.342789244
    const x = mercator ? longitude * origin / 180 : longitude
    const y = mercator
      ? Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) * origin / Math.PI
      : latitude
    return {
      x: (x - extent.xmin) / (extent.xmax - extent.xmin) * width,
      y: (extent.ymax - y) / (extent.ymax - extent.ymin) * height
    }
  }
  return view.toScreen?.({
    x: longitude,
    y: latitude,
    spatialReference: { wkid: 4326 }
  })
}

function mapPoint (view: LabelZoomView, longitude: number, latitude: number): { x: number, y: number } | null {
  const extent = view.extent
  if (!extent || typeof extent.xmin !== 'number' || typeof extent.ymin !== 'number') return null
  const mercator = Math.abs(extent.xmin) > 180 || Math.abs(extent.xmax || 0) > 180
  const origin = 20037508.342789244
  return {
    x: mercator ? longitude * origin / 180 : longitude,
    y: mercator
      ? Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) * origin / Math.PI
      : latitude
  }
}

function insideExtent (view: LabelZoomView, longitude: number, latitude: number): boolean {
  const extent = view.extent
  const point = mapPoint(view, longitude, latitude)
  if (!extent || !point || typeof extent.xmin !== 'number' || typeof extent.xmax !== 'number') return false
  if (typeof extent.ymin !== 'number' || typeof extent.ymax !== 'number') return false
  return point.x >= extent.xmin && point.x <= extent.xmax && point.y >= extent.ymin && point.y <= extent.ymax
}

function thinLabelsForView (
  view: LabelZoomView | undefined,
  specs: readonly LabelGraphicSpec[]
): LabelGraphicSpec[] | null {
  if (!view?.toScreen) return specs.filter((spec) => spec.allowOverlap !== false)
  const width = view.width
  const height = view.height
  const screened: ScreenLabel[] = []
  for (const spec of specs) {
    const screen = screenPoint(view, spec.x, spec.y)
    if (!screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) continue
    if (typeof width === 'number' && typeof height === 'number') {
      if (screen.x < -40 || screen.y < -40 || screen.x > width + 40 || screen.y > height + 40) continue
    }
    screened.push({ ...spec, screenX: screen.x, screenY: screen.y })
  }
  // A room inside the extent that does not land on the canvas means the
  // screen mapping is not ready. Do not wipe names on that paint.
  const waiting = specs.some((spec) => insideExtent(view, spec.x, spec.y)) && !screened.length
  if (waiting && (view.__audiomScreenTries || 0) < 40) {
    view.__audiomScreenTries = (view.__audiomScreenTries || 0) + 1
    setTimeout(() => view.__audiomLabelRedraw?.(false), 300)
    return null
  }
  if (screened.length) view.__audiomScreenTries = 0
  return thinLabels(screened)
}

function styleFromEmbed (specs: readonly LabelGraphicSpec[], zoom: number, mode: string): LabelGraphicSpec[] {
  if (!Number.isFinite(zoom)) return []
  const styled: LabelGraphicSpec[] = []
  for (const spec of specs) {
    const properties = spec.properties || { name: spec.text }
    const embed = embedLabelStyle(properties, zoom, mode)
    if (!embed) continue
    styled.push({
      ...spec,
      text: embed.text,
      priority: embed.priority,
      size: embed.size,
      padding: embed.padding,
      color: embed.color,
      haloColor: embed.haloColor,
      haloSize: embed.haloSize,
      fontFamily: embed.fontFamily,
      allowOverlap: embed.allowOverlap
    })
  }
  return styled
}

function findDrawLayer (map: LabelDrawMap, id: string): LabelDrawLayer | undefined {
  let found: LabelDrawLayer | undefined
  const visit = (layer: LabelDrawLayer) => {
    if (layer.id === id) found = layer
  }
  map.allLayers?.forEach(visit)
  if (!found) map.layers?.forEach?.(visit)
  return found
}

/**
 * Draw room names as text graphics. labelingInfo on the feature layer did
 * not produce pixels, so this layer is the overlay the embed already shows.
 */
async function drawAudiomLabels (
  jimuMapView: SnapshotMapView | undefined,
  specs: readonly LabelGraphicSpec[],
  mode: VectorStyleMode,
  showLabels: boolean
): Promise<void> {
  const map = labelMap(jimuMapView)
  if (!map) return
  let loaded: unknown[]
  try {
    const jimu = await import('jimu-core')
    loaded = await jimu.loadArcGISJSAPIModules([
      'esri/layers/GraphicsLayer',
      'esri/Graphic',
      'esri/geometry/Point',
      'esri/symbols/TextSymbol',
      'esri/geometry/SpatialReference'
    ]) as unknown[]
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Audiom labels skipped, text modules did not load', error)
    return
  }
  const GraphicsLayer = loaded[0] as (new (properties: unknown) => LabelDrawLayer) | undefined
  const Graphic = loaded[1] as (new (properties: unknown) => unknown) | undefined
  const Point = loaded[2] as (new (properties: unknown) => unknown) | undefined
  const TextSymbol = loaded[3] as (new (properties: unknown) => unknown) | undefined
  const SpatialReference = loaded[4] as (new (properties: unknown) => unknown) | undefined
  if (!GraphicsLayer || !Graphic || !Point || !TextSymbol || !SpatialReference) {
    // eslint-disable-next-line no-console
    console.error('Audiom labels skipped, text modules did not load')
    return
  }
  const zoom = readLabelZoom(jimuMapView)
  const styled = !showLabels || !specs.length ? [] : styleFromEmbed(specs, zoom, mode)
  const placed = thinLabelsForView(labelView(jimuMapView), styled)
  if (placed == null) return
  const graphics = placed.map((spec) => new Graphic({
    geometry: pointForView(Point, spec.x, spec.y),
    symbol: new TextSymbol({
      ...labelSymbolPaint(mode, spec.text, spec.size),
      color: spec.color,
      haloColor: spec.haloColor,
      haloSize: spec.haloSize,
      font: {
        size: spec.size ?? 12,
        family: spec.fontFamily || 'Arial',
        weight: 'normal'
      }
    }),
    attributes: { audiomLabel: true }
  }))
  // view.graphics draws above every layer, including a basemap reference
  // overlay that would cover a feature-layer label.
  const screen = labelScreen(jimuMapView)
  if (screen?.add && screen.remove && screen.forEach) {
    const stale: LabelScreenGraphic[] = []
    screen.forEach((graphic) => {
      if (graphic.attributes?.audiomLabel) stale.push(graphic)
    })
    stale.forEach((graphic) => screen.remove?.(graphic))
    graphics.forEach((graphic) => screen.add?.(graphic))
    return
  }
  let layer = findDrawLayer(map, AUDIOM_LABEL_LAYER_ID)
  if (!layer) {
    layer = new GraphicsLayer({
      id: AUDIOM_LABEL_LAYER_ID,
      title: 'Audiom labels',
      listMode: 'hide',
      legendEnabled: false
    })
    if (map.layers?.add) map.layers.add(layer)
    else map.add?.(layer)
  }
  layer.visible = showLabels
  layer.removeAll?.()
  if (layer.addMany) layer.addMany(graphics)
  else graphics.forEach((graphic) => layer?.add?.(graphic))
  const avatar = findDrawLayer(map, 'audiom-avatar')
  const length = map.layers?.length
  if (avatar && map.layers?.reorder && typeof length === 'number') {
    map.layers.reorder(avatar, Math.max(0, length - 1))
  }
}

function removeAudiomLabels (jimuMapView: SnapshotMapView | undefined): void {
  clearLabelZoom(jimuMapView)
  const screen = labelScreen(jimuMapView)
  if (screen?.forEach && screen.remove) {
    const stale: LabelScreenGraphic[] = []
    screen.forEach((graphic) => {
      if (graphic.attributes?.audiomLabel) stale.push(graphic)
    })
    stale.forEach((graphic) => screen.remove?.(graphic))
  }
  const map = labelMap(jimuMapView)
  if (!map) return
  const layer = findDrawLayer(map, AUDIOM_LABEL_LAYER_ID)
  if (!layer) return
  layer.removeAll?.()
  map.layers?.remove?.(layer)
  map.remove?.(layer)
  layer.destroy?.()
}

/** Put each painted layer's host renderer and labeling back. */
export function restoreAudiomStyles (jimuMapView: SnapshotMapView | undefined): void {
  const layers = jimuMapView?.view?.map?.allLayers || jimuMapView?.map?.allLayers
  layers?.forEach((layer) => {
    restoreAudiomSymbols(layer as SymbolLayer)
    restoreAudiomLabels(layer as LabelLayer)
  })
  removeAudiomLabels(jimuMapView)
}

/**
 * Start Audiom's browser resume during the key or click. The widget must
 * call this before awaiting unlockBundledAudio. A resume that starts after
 * that await is no longer inside the gesture, and the step tone stays silent.
 */
export function primeBundledAudio (handle: BundledRuntimeHandle | null | undefined): void {
  handle?.program?.primeAudio?.()
}

/**
 * Resume Audiom's audio from a user gesture. False when no soundpack is loaded.
 * The compiled session returns a Promise; comparing that to true is always false,
 * so the click never counted as an unlock.
 */
export function unlockBundledAudio (handle: BundledRuntimeHandle | null | undefined): Promise<boolean> {
  const pending = handle?.program?.unlockAudio?.()
  return Promise.resolve(pending).then((unlocked) => {
    if (unlocked && handle) handle.activationRequired = false
    return unlocked === true
  }).catch(() => false)
}
