import {
  GeometryFamily,
  LayerDisposition,
  type MapSnapshot,
  type RecordSnapshot,
  type SourceSnapshot,
  SourceStatus
} from '../../../../shared/audiom-runtime/src/types'
import { MapType } from '../../../../shared/audiom-client/AudiomSource'
import { isDataSourceLayerType, isRasterLayerType } from '../utils/mapEnums'
import { graphicName, loadMapModules } from './esriMapSurface'
import { applyConfiguredRules } from './rulesStyle'

/** Same fallback as Audiom-Front-End esriLayerSync. A mismatch misses the eye toggle. */
export const FALLBACK_LAYER_SOURCE_ID = 'layer'

export interface SnapshotFeature {
  attributes?: Record<string, unknown>
  geometry?: {
    type?: string
    x?: number
    y?: number
    longitude?: number
    latitude?: number
    paths?: number[][][]
    rings?: number[][][]
  }
}

export interface SnapshotLayer {
  id?: string
  title?: string
  type?: string
  visible?: boolean
  geometryType?: string
  /** False when the layer is outside the current scale. Those features stay navigable. */
  scaleVisible?: boolean
  objectIdField?: string
  /** Esri field used as the feature's display name, when the layer publishes one. */
  displayField?: string
  /** Native popup title. A {field} title is the plot name the tooltip shows. */
  popupTemplate?: { title?: string }
  /** Service field catalog. Aliases and units are the statistic labels. */
  fields?: Array<{
    name?: string
    alias?: string
    type?: string
  }>
  createQuery?: () => {
    where?: string
    outFields?: string[]
    returnGeometry?: boolean
    outSpatialReference?: { wkid: number }
    geometry?: unknown
    spatialRelationship?: string
    num?: number
    start?: number
    resultOffset?: number
    outStatistics?: Array<{
      onStatisticField?: string
      outStatisticFieldName?: string
      statisticType?: string
    }>
  }
  queryFeatures?: (query: unknown) => Promise<{
    features?: SnapshotFeature[]
    exceededTransferLimit?: boolean
  }>
  /** Service total. The legend uses this when geometry pages come back short. */
  queryFeatureCount?: (query: unknown) => Promise<number | { count?: number }>
  /** Queried service total. Not a contract field. */
  serviceFeatureCount?: number
  /** Resolves when the layer can be queried. Absent means query immediately. */
  when?: () => Promise<unknown>
  load?: () => Promise<unknown>
  /** Nested operational layers. Group layers are not queried themselves. */
  layers?: { forEach: (fn: (layer: SnapshotLayer) => void) => void }
  /** Map-image and subtype children. Queried when the parent has no query. */
  sublayers?: { forEach: (fn: (layer: SnapshotLayer) => void) => void }
  /** True for a basemap layer. Those are not data sources. */
  isBasemap?: boolean
  listMode?: string
  /** Feature service URL. Used to match a configured source map type. */
  url?: string
  /** The map's own feature filter. A floor picker is rewritten, not hardcoded. */
  definitionExpression?: string | null
  /** Esri floor-aware layers name the floor field here. */
  floorInfo?: { field?: string } | null
  /** Floor catalog. The rules file excludes Level; this layer has no use type. */
  floorCatalog?: boolean
  /** Rules file evaluated onto this layer's features. Null when none applied. */
  rulesRef?: string
  /** Test double. Production layers are read through queryFeatures. */
  features?: SnapshotFeature[]
  /** Esri spatial reference. Prototype getter; read it, do not spread the layer. */
  spatialReference?: { wkid?: number, latestWkid?: number, wkt?: string }
}

/** An Esri layer collection. Iterate it; it is not an array. */
export interface SnapshotLayerList {
  forEach: (fn: (layer: SnapshotLayer) => void) => void
}

export interface SnapshotMapSurface {
  allLayers?: SnapshotLayerList
  /** Basemap constituents. They ride in allLayers but are not data sources. */
  basemap?: {
    baseLayers?: SnapshotLayerList
    referenceLayers?: SnapshotLayerList
  }
}

export interface SnapshotMapView {
  map?: SnapshotMapSurface
  view?: {
    extent?: unknown
    map?: SnapshotMapSurface
  }
}

const FAMILY_BY_TYPE: Record<string, GeometryFamily> = {
  point: GeometryFamily.Point,
  multipoint: GeometryFamily.MultiPoint,
  polyline: GeometryFamily.LineString,
  polygon: GeometryFamily.Polygon
}

const FEATURE_LIMIT = 200
/** Indoor units are the rooms. The first service page is one floor, and every other room says Empty Space. */
const INDOOR_PAGE = 1000
const INDOOR_FEATURE_CAP = 5000
const LAYER_LOAD_TIMEOUT = 'Audiom layer load timed out'

function withTimeout<T> (pending: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(LAYER_LOAD_TIMEOUT)), ms)
    pending.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

/** The existing map is the visual surface. This describes its layers and features. */
export function snapshotFromMapView (
  jimuMapView: SnapshotMapView | undefined,
  dataSourceId: string,
  mapTypes?: readonly SnapshotMapTypeHint[]
): MapSnapshot {
  const sources: SourceSnapshot[] = []
  const records: RecordSnapshot[] = []
  const layers = jimuMapView?.view?.map?.allLayers || jimuMapView?.map?.allLayers
  if (!layers) return { sources, records, dataSourceId }
  const listed: SnapshotLayer[] = []
  layers.forEach((layer) => listed.push(layer))
  const floorFields = floorFieldsFromSnapshots(listed)

  const configured = visibilityHints(mapTypes)
  listed.forEach((layer) => {
    // The Source Configuration eye wins over a layer that has not applied
    // its web-map visibility yet. Units was still hidden while Levels was not.
    applyConfiguredVisibility(layer, mapTypes)
    if (isInternalLayer(layer)) return
    const hint = configured.length ? hintForLayer(layer, configured) : undefined
    // Data Sources lists Source Configurations. The indoor service folder
    // ("ArcGIS Indoors Sample Data WFL1") is on the map and is not one.
    if (configured.length && !hint) return
    const sourceId = layer.id || layer.title || FALLBACK_LAYER_SOURCE_ID
    const supported = hint
      ? hint.enabled !== false
      : !isRasterLayer(layer) && (
        isDataSourceLayerType(layer.type || '') ||
        (typeof layer.queryFeatures === 'function' && typeof layer.createQuery === 'function')
      )
    const hidden = hint ? hint.enabled === false : layer.visible === false
    const outOfScale = layer.scaleVisible === false
    // A configured or visible operational layer is a data source even before
    // its features are queried. Rule colors are painted later and must not
    // hide the layer.
    const bound = supported && !hidden
    sources.push({
      sourceId,
      displayName: hint?.title || layer.title || sourceId,
      geometryFamily: FAMILY_BY_TYPE[layer.geometryType || ''] || null,
      mapType: mapTypeForLayer(layer, mapTypes),
      rulesRef: layer.rulesRef?.trim() || null,
      disposition: bound ? LayerDisposition.Bound : LayerDisposition.VisualOnly,
      // The service total, when the geometry page was dropped. The loop below
      // raises it if more records were actually emitted.
      recordCount: layer.serviceFeatureCount || 0,
      status: SourceStatus.Complete
    })
    const features = (layer as SnapshotLayer & { features?: SnapshotFeature[] }).features
    if (!features?.length) return
    // A hidden configuration is still a layer with features. Dropping them
    // made the legend count 0. The eye, not this count, decides navigation.
    if ((!supported || hidden) && !hint) return
    // Out of scale stays navigable. A closed eye does not.
    const navigable = hint ? hint.enabled !== false : supported && (bound || outOfScale)
    const cap = isFloorLayer(layer, floorFields) ? INDOOR_FEATURE_CAP : FEATURE_LIMIT
    for (const feature of features.slice(0, cap)) {
      const record = featureRecord(dataSourceId, sourceId, layer, feature, navigable)
      if (record) records.push(record)
    }
  })
  for (const source of sources) {
    const emitted = records.filter((record) => record.sourceId === source.sourceId).length
    source.recordCount = Math.max(source.recordCount, emitted)
  }
  return { sources, records, dataSourceId }
}

/**
 * Query features already on the Esri map and return a snapshot Audiom can load.
 * Does not fetch layer URLs and does not invent geometry.
 */
export interface SnapshotMapTypeHint {
  id?: string
  title?: string
  url?: string
  mapType?: string
  /** Absolute or root-relative rules file. Resolved by the caller. */
  rulesFileUrl?: string
  /**
   * Source Configuration eye. When any hint sets this, Data Sources lists
   * those configurations only, and the eye follows this flag.
   */
  enabled?: boolean
}

/** Hints that name a Source Configuration and its eye. Map-type-only hints do not. */
function visibilityHints (hints: readonly SnapshotMapTypeHint[] | undefined): SnapshotMapTypeHint[] {
  return (hints || []).filter((hint) =>
    typeof hint.enabled === 'boolean' && Boolean(hint.id || hint.title || hint.url)
  )
}

function featureServiceUrl (url: string): string {
  return url.split('?')[0].replace(/\/+$/, '').toLowerCase()
}

function sameFeatureUrl (layerUrl: string, hintUrl: string): boolean {
  return featureServiceUrl(layerUrl) === featureServiceUrl(hintUrl)
}

/**
 * Id, then the exact feature-service URL, then the title. A parent folder
 * named after the service must not match a child configuration.
 */
function hintForLayer (
  layer: SnapshotLayer,
  hints: readonly SnapshotMapTypeHint[]
): SnapshotMapTypeHint | undefined {
  const id = layer.id || ''
  const title = layer.title || ''
  const url = layer.url || ''
  return hints.find((hint) => Boolean(hint.id && id && hint.id === id)) ||
    hints.find((hint) => Boolean(hint.url && url && sameFeatureUrl(url, hint.url))) ||
    hints.find((hint) => Boolean(hint.title && title && hint.title === title))
}

/** The configuration eye is what Data Sources shows, and what the map draws. */
function applyConfiguredVisibility (
  layer: SnapshotLayer,
  hints: readonly SnapshotMapTypeHint[] | undefined
): void {
  const configured = visibilityHints(hints)
  if (!configured.length) return
  const hint = hintForLayer(layer, configured)
  if (!hint) return
  layer.visible = hint.enabled !== false
}

function audiomMapType (value: string | undefined): string {
  if (value === MapType.Heatmap || value === MapType.Indoor || value === MapType.Travel) return value
  return MapType.Travel
}

function mapTypeForLayer (
  layer: SnapshotLayer,
  hints: readonly SnapshotMapTypeHint[] | undefined
): string {
  if (!hints?.length) return MapType.Travel
  const id = layer.id || ''
  const title = layer.title || ''
  const url = layer.url || ''
  const hint = hints.find((item) => {
    if (!item.mapType) return false
    if (item.id && id && item.id === id) return true
    if (item.title && title && item.title === title) return true
    if (item.url && url && (url === item.url || url.startsWith(item.url) || item.url.startsWith(url))) return true
    return false
  })
  if (hint) return audiomMapType(hint.mapType)
  // Experience Builder layer ids often differ from the widget source id.
  // One configured heatmap source is the map the panel was asked to draw.
  const configured = hints.filter((item) => item.mapType)
  if (configured.length === 1) return audiomMapType(configured[0].mapType)
  return MapType.Travel
}

/** Basemap base and reference layers. They ride in allLayers, sometimes as a different object. */
function basemapMembers (map: SnapshotMapSurface | undefined): {
  layers: Set<SnapshotLayer>
  ids: Set<string>
  titles: Set<string>
} {
  const layers = new Set<SnapshotLayer>()
  const ids = new Set<string>()
  const titles = new Set<string>()
  const note = (layer: SnapshotLayer) => {
    layers.add(layer)
    if (layer.id) ids.add(layer.id)
    if (layer.title) titles.add(layer.title)
  }
  map?.basemap?.baseLayers?.forEach(note)
  map?.basemap?.referenceLayers?.forEach(note)
  return { layers, ids, titles }
}

function isBasemapMember (
  layer: SnapshotLayer,
  members: { layers: Set<SnapshotLayer>, ids: Set<string>, titles: Set<string> }
): boolean {
  if (members.layers.has(layer)) return true
  // allLayers can hold a wrapper that is not the same object as basemap.baseLayers.
  if (layer.id && members.ids.has(layer.id)) return true
  return Boolean(layer.title && members.titles.has(layer.title))
}

export async function snapshotFeaturesFromMapView (
  jimuMapView: SnapshotMapView | undefined,
  dataSourceId: string,
  mapTypes?: readonly SnapshotMapTypeHint[],
  viewExtent?: unknown,
  indicator?: { longitude: number, latitude: number }
): Promise<MapSnapshot> {
  const map = jimuMapView?.view?.map?.allLayers ? jimuMapView?.view?.map : jimuMapView?.map
  const layers = map?.allLayers
  if (!layers) return snapshotFromMapView(jimuMapView, dataSourceId)
  const basemapLayers = basemapMembers(map)
  const loaded: SnapshotLayer[] = []
  const pending: Array<Promise<void>> = []
  const queue: SnapshotLayer[] = []
  layers.forEach((layer) => queue.push(layer))
  for (let index = 0; index < queue.length; index += 1) {
    const layer = queue[index]
    const enqueue = (child: SnapshotLayer) => {
      if (!queue.includes(child)) queue.push(child)
    }
    layer.layers?.forEach(enqueue)
    layer.sublayers?.forEach(enqueue)
  }
  const floorFields = floorFieldsFromSnapshots(queue)
  const configured = visibilityHints(mapTypes)
  const processed = new Set<SnapshotLayer>()
  for (const layer of queue) {
    if (processed.has(layer)) continue
    processed.add(layer)
    // Basemap base and reference layers (terrain hillshade, say) ride in
    // allLayers but carry no features. Drop them before a force-load; the
    // hillshade tile service can hang and stall the whole snapshot.
    // Identity misses when allLayers holds a wrapper of the basemap layer.
    if (isBasemapMember(layer, basemapLayers)) continue
    // Apply the Source Configuration eye before copying. An indoor layer can
    // still report visible false while it loads; the copy would keep that.
    applyConfiguredVisibility(layer, mapTypes)
    const copy = layerCopy(layer)
    loaded.push(copy)
    if (isInternalLayer(layer)) continue
    const hint = configured.length ? hintForLayer(layer, configured) : undefined
    if (configured.length && !hint) continue
    // A Source Configuration is counted even when its eye is off. Skipping
    // the query is why Details, Facilities, Sites, and a not-yet-visible
    // Units all read 0. The eye still controls whether the map draws them.
    if (layer.visible === false && !hint) continue
    const canQuery = typeof layer.queryFeatures === 'function' && typeof layer.createQuery === 'function'
    // A configured layer may not expose queryFeatures until it loads. Waiting
    // here is what puts Units in the snapshot with Levels, not after it.
    const waitForLoad = Boolean(hint) && typeof layer.when === 'function'
    if (!canQuery && !waitForLoad) continue
    pending.push(queryLayerFeatures(
      layer,
      copy,
      viewExtent ?? jimuMapView?.view?.extent,
      indicator,
      floorFields
    ))
  }
  await Promise.all(pending)
  await projectLoadedFeatures(loaded)
  // Before rules. The augmenter appends levelName, and the Levels dropdown
  // reads levelOrdinal. Units only have a LEVEL_ID guid until this join.
  stampIndoorLevels(loaded, mapTypes)
  // After the query. Applying earlier stamps copies the query then replaces.
  await applyConfiguredRules(loaded, mapTypes)
  const view = {
    map: { allLayers: { forEach: (fn: (layer: SnapshotLayer) => void) => { loaded.forEach(fn) } } }
  }
  const snapshot = snapshotFromMapView({ map: view.map }, dataSourceId, mapTypes)
  ;(snapshot as MapSnapshot & { queriedLayers?: SnapshotLayer[] }).queriedLayers = loaded
  return snapshot
}

/**
 * Esri layer fields are prototype getters. A spread copy drops type,
 * geometryType, and displayField, so the menu never sees the layer.
 */
function layerCopy (layer: SnapshotLayer): SnapshotLayer & { features?: SnapshotFeature[] } {
  return {
    id: layer.id,
    title: layer.title,
    type: layer.type,
    visible: layer.visible,
    geometryType: layer.geometryType,
    scaleVisible: layer.scaleVisible,
    objectIdField: layer.objectIdField,
    displayField: layer.displayField,
    popupTemplate: layer.popupTemplate?.title ? { title: layer.popupTemplate.title } : undefined,
    spatialReference: layer.spatialReference,
    fields: fieldCatalog(layer.fields),
    url: layer.url,
    definitionExpression: layer.definitionExpression,
    floorInfo: layer.floorInfo?.field ? { field: layer.floorInfo.field } : undefined,
    isBasemap: layer.isBasemap,
    listMode: layer.listMode,
    features: layer.features
  }
}

/** Plain copies. Esri field objects are prototype getters and do not survive a spread. */
function fieldCatalog (fields: SnapshotLayer['fields']): SnapshotLayer['fields'] {
  if (!fields) return undefined
  const catalog: NonNullable<SnapshotLayer['fields']> = []
  const list = fields as ArrayLike<{ name?: string, alias?: string, type?: string }> & {
    forEach?: (fn: (field: { name?: string, alias?: string, type?: string }) => void) => void
  }
  const push = (field: { name?: string, alias?: string, type?: string }) => {
    if (!field?.name) return
    catalog.push({ name: field.name, alias: field.alias, type: field.type })
  }
  if (typeof list.forEach === 'function') list.forEach(push)
  else Array.from(list).forEach(push)
  return catalog
}

/** A service folder. Children are the sources. The folder title is the service name. */
function isGroupLayer (layer: SnapshotLayer): boolean {
  if (layer.type === 'group') return true
  // An unloaded group has children and cannot be queried. A feature layer does not.
  if (layer.type) return false
  return Boolean(layer.layers) && typeof layer.queryFeatures !== 'function'
}

/** The avatar marker, basemap tiles, rasters, and service folders are not data sources. */
function isInternalLayer (layer: SnapshotLayer): boolean {
  if (layer.id === 'audiom-avatar' || layer.listMode === 'hide') return true
  if (layer.isBasemap) return true
  if (isGroupLayer(layer)) return true
  return isRasterLayer(layer)
}

/**
 * Imagery layers expose queryFeatures, then reject it. They are pictures,
 * not features, and must not be listed or queried.
 */
function isRasterLayer (layer: SnapshotLayer): boolean {
  return isRasterLayerType(layer.type || '')
}

/** Wait for the layer, then query. A layer that is still loading has no features yet. */
async function queryLayerFeatures (
  layer: SnapshotLayer,
  copy: SnapshotLayer & { features?: SnapshotFeature[] },
  viewExtent?: unknown,
  indicator?: { longitude: number, latitude: number },
  floorFields: readonly string[] = []
): Promise<void> {
  try {
    if (typeof layer.when === 'function') await withTimeout(layer.when(), 8000)
    else if (typeof layer.load === 'function') await withTimeout(layer.load(), 8000)
  } catch (error) {
    copy.features = []
    // A raster or basemap reference layer (terrain hillshade, for one) can
    // leave its load pending. It holds no features, so a timeout is an
    // expected skip, not a failure that should read as an error.
    const timedOut = error instanceof Error && error.message === LAYER_LOAD_TIMEOUT
    // A picture that never finishes loading is not a data source. Leaving it
    // listed is how World_Hillshade showed up next to the choropleth.
    if (timedOut) copy.listMode = 'hide'
    // eslint-disable-next-line no-console
    if (timedOut) console.warn('Audiom skipped a layer that did not finish loading', copy.title || copy.id)
    // eslint-disable-next-line no-console
    else console.error('Audiom could not load layer', copy.title || copy.id, error)
    return
  }
  // Load can publish fields that were missing when the layer was queued.
  copy.type = layer.type
  copy.geometryType = layer.geometryType
  copy.displayField = layer.displayField
  copy.url = layer.url || copy.url
  copy.popupTemplate = layer.popupTemplate?.title ? { title: layer.popupTemplate.title } : copy.popupTemplate
  copy.fields = fieldCatalog(layer.fields)
  copy.objectIdField = layer.objectIdField
  // The embed clears the published floor clause and draws the floor with a
  // layer-view filter. Keep the clause we copied before that, or the query
  // stays on one floor and the Levels toggle never sees a second ordinal.
  copy.definitionExpression = layer.definitionExpression || copy.definitionExpression
  copy.floorInfo = layer.floorInfo?.field ? { field: layer.floorInfo.field } : copy.floorInfo
  // Load also settles the type. A raster whose type was blank when it was
  // queued is a picture, not a feature source, and must not be queried.
  if (isRasterLayer(layer) || typeof layer.queryFeatures !== 'function' || typeof layer.createQuery !== 'function') {
    copy.features = []
    return
  }
  try {
    // Layers that carry the map's floor field are queried whole. Travel
    // keeps its own where. The shared floor list is often empty until load,
    // and the live clause may already have been cleared, so the copy's
    // published clause counts too. Otherwise Units stops at the 200-feature
    // page, only one floor is stamped, and the Levels toggle is omitted.
    const indoor = isFloorLayer(copy, floorFields) || isFloorLayer(layer, floorFields) || Boolean(ownFloorField(copy)) || Boolean(ownFloorField(layer))
    // A floor clause left on the layer is ANDed with this query. Units and
    // Levels then come back empty, and the legend says 0. Clear it before
    // createQuery copies it. The view filter still draws the selected floor.
    if (indoor && layer.definitionExpression) {
      try { layer.definitionExpression = null } catch { /* where = 1=1 still replaces a copied clause */ }
    }
    const query = layer.createQuery()
    query.returnGeometry = true
    query.outFields = ['*']
    query.where = indoor ? '1=1' : (query.where || '1=1')
    if (!viewExtent) query.geometry = null
    // Audiom stores longitude and latitude. A web map in Web Mercator
    // otherwise returns meters, which the ENU projection rejects.
    // The first 200 features in the service are not the tracts under the
    // indicator. Intersect the current view so the page is the map on screen.
    if (viewExtent) {
      query.geometry = viewExtent
      query.spatialRelationship = 'intersects'
    }
    query.outSpatialReference = { wkid: 4326 }
    // The legend number is the service total, not how many rings survived
    // projection. A floor-filtered queryFeatures can return none while the
    // count is 239.
    copy.serviceFeatureCount = await countServiceFeatures(layer)
    // A LEVEL_ID layer is an indoor floor plan. The first 200 rows are not
    // the rooms on the other floors, so page the service. Travel and heatmap
    // stay on the 200-feature page.
    const page = await queryFeaturePages(layer, query, indoor)
    // The tract under the indicator must be in the snapshot or the step says Empty Space.
    const standing = await featuresAtIndicator(layer, indicator)
    copy.features = await geographicFeatures(layer, mergeFeatures(page, standing))
    await attachFieldExtents(layer, copy)
    if (!copy.features.length) {
      // eslint-disable-next-line no-console
      console.error('Audiom layer query returned no features', copy.title || copy.id, copy.type)
    }
  } catch (error) {
    copy.features = []
    if (copy.serviceFeatureCount == null) copy.serviceFeatureCount = await countServiceFeatures(layer)
    // eslint-disable-next-line no-console
    console.error('Audiom layer query failed', copy.title || copy.id, error)
  }
}

/** Whole-layer count. Ignores a floor clause already cleared by the caller. */
async function countServiceFeatures (layer: SnapshotLayer): Promise<number | undefined> {
  if (typeof layer.queryFeatureCount !== 'function' || typeof layer.createQuery !== 'function') return undefined
  try {
    const query = layer.createQuery()
    query.where = '1=1'
    query.geometry = null
    query.returnGeometry = false
    const result = await layer.queryFeatureCount(query)
    const count = typeof result === 'number' ? result : result?.count
    return typeof count === 'number' && Number.isFinite(count) ? count : undefined
  } catch {
    return undefined
  }
}

/** The plot containing the indicator. A failed point query does not wipe the page. */
async function featuresAtIndicator (
  layer: SnapshotLayer,
  indicator?: { longitude: number, latitude: number }
): Promise<SnapshotFeature[]> {
  if (!indicator || typeof layer.createQuery !== 'function' || typeof layer.queryFeatures !== 'function') return []
  try {
    const query = layer.createQuery()
    query.where = '1=1'
    query.returnGeometry = true
    query.outFields = ['*']
    query.geometry = {
      type: 'point',
      x: indicator.longitude,
      y: indicator.latitude,
      spatialReference: { wkid: 4326 }
    }
    query.spatialRelationship = 'intersects'
    query.outSpatialReference = { wkid: 4326 }
    query.num = 5
    const result = await layer.queryFeatures(query)
    return result?.features || []
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Audiom indicator query failed', layer.title || layer.id, error)
    return []
  }
}

function mergeFeatures (page: SnapshotFeature[], standing: SnapshotFeature[]): SnapshotFeature[] {
  if (!standing.length) return page
  const seen = new Set(page.map(featureKey))
  const extra = standing.filter((feature) => !seen.has(featureKey(feature)))
  return extra.length ? [...page, ...extra] : page
}

function featureKey (feature: SnapshotFeature): string {
  const attributes = feature.attributes || {}
  const id = attributes.OBJECTID ?? attributes.objectid ?? attributes.FID ?? attributes.fid
  return id == null ? JSON.stringify(feature.geometry || {}) : String(id)
}

function eachField (
  fields: SnapshotLayer['fields'],
  visit: (field: { name?: string }) => void
): void {
  if (!fields) return
  // Esri fields are a Collection. for...of misses it; fieldCatalog already
  // reads it with forEach. A missed LEVEL_ID keeps the one-floor query.
  const list = fields as ArrayLike<{ name?: string }> & {
    forEach?: (fn: (field: { name?: string }) => void) => void
  }
  if (typeof list.forEach === 'function') list.forEach(visit)
  else Array.from(list).forEach(visit)
}

function hasField (layer: SnapshotLayer, name: string): boolean {
  const target = name.toUpperCase()
  let found = false
  eachField(layer.fields, (field) => {
    if (field?.name?.toUpperCase() === target) found = true
  })
  return found
}

function expressionFieldNames (expression: string | null | undefined): string[] {
  const names: string[] = []
  const selector = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|IN)\s*/gi
  const text = expression || ''
  let match = selector.exec(text)
  while (match) {
    names.push(match[1])
    match = selector.exec(text)
  }
  return names
}

/**
 * Page a feature service. Esri sets exceededTransferLimit when the page is
 * not the whole layer. A service that ignores start returns the same page;
 * merging by object id then stops the loop.
 */
async function queryFeaturePages (
  layer: SnapshotLayer,
  query: { num?: number, start?: number, resultOffset?: number },
  indoor: boolean
): Promise<SnapshotFeature[]> {
  const pageSize = indoor ? INDOOR_PAGE : FEATURE_LIMIT
  const cap = indoor ? INDOOR_FEATURE_CAP : FEATURE_LIMIT
  const collected: SnapshotFeature[] = []
  for (let page = 0; collected.length < cap && page < 8; page += 1) {
    query.num = Math.min(pageSize, cap - collected.length)
    query.start = collected.length
    query.resultOffset = collected.length
    const result = await layer.queryFeatures?.(query)
    const features = result?.features || []
    const next = mergeFeatures(collected, features)
    if (!indoor) return next
    if (!features.length || next.length === collected.length) return next
    const truncated = result?.exceededTransferLimit === true || features.length >= (query.num || pageSize)
    if (!truncated) return next
    collected.splice(0, collected.length, ...next)
  }
  return collected
}

function levelKey (value: unknown): string | undefined {
  if (value == null || value === '') return undefined
  const text = String(value).trim()
  return text ? text.toUpperCase() : undefined
}

function levelNumber (value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function levelLabel (name: string, ordinal: number): string {
  const trimmed = name.trim()
  if (!trimmed) return `Level ${ordinal}`
  const digit = trimmed.match(/Level\s+(\d+)/i)
  if (digit) return `Level ${digit[1]}`
  if (/Level\s+G\b/i.test(trimmed) || /\bGround\b/i.test(trimmed)) return 'Ground Level'
  return trimmed
}

/** Units carry the map's floor id, not levelOrdinal. The floor catalog layer
 * has the ordinal and the spoken name. The id field is the one the map's own
 * filter uses, not a fixed indoor column.
 */
function stampIndoorLevels (
  layers: Array<SnapshotLayer & { features?: SnapshotFeature[] }>,
  mapTypes?: readonly SnapshotMapTypeHint[]
): void {
  const floorFields = floorFieldsFromSnapshots(layers)
  let stamped = false
  for (const floorField of floorFields) {
    if (stampFloorField(layers, floorField)) stamped = true
  }
  // The embed may have cleared every floor clause before this snapshot was
  // copied. The catalog join still knows which id is a floor.
  if (!stamped) stampFloorCatalog(layers, mapTypes)
}

function stampFloorField (
  layers: Array<SnapshotLayer & { features?: SnapshotFeature[] }>,
  floorField: string
): boolean {
  const catalog = layers.find((layer) => orderFieldOf(layer, floorField))
  const orderField = catalog ? orderFieldOf(catalog, floorField) : undefined
  if (!catalog?.features?.length || !orderField) return false
  const mappings = floorMappings(catalog, floorField, orderField)
  if (!mappings.size) return false
  catalog.floorCatalog = true
  return applyFloorMappings(layers, floorField, mappings)
}

function floorMappings (
  catalog: SnapshotLayer & { features?: SnapshotFeature[] },
  floorField: string,
  orderField: string
): Map<string, { ordinal: number, name: string }> {
  const mappings = new Map<string, { ordinal: number, name: string }>()
  for (const feature of catalog.features || []) {
    const attributes = feature.attributes || {}
    const id = levelKey(attribute(attributes, floorField))
    const ordinal = levelNumber(attribute(attributes, orderField))
    if (!id || ordinal == null || mappings.has(id)) continue
    const raw = [attributes.NAME, attributes.NAME_SHORT, attributes.LEVEL_NAME].find(
      (value) => typeof value === 'string' && value.trim()
    )
    mappings.set(id, {
      ordinal,
      name: levelLabel(typeof raw === 'string' ? raw : '', ordinal)
    })
  }
  return mappings
}

function applyFloorMappings (
  layers: Array<SnapshotLayer & { features?: SnapshotFeature[] }>,
  floorField: string,
  mappings: Map<string, { ordinal: number, name: string }>
): boolean {
  let stamped = false
  for (const layer of layers) {
    for (const feature of layer.features || []) {
      const attributes = feature.attributes
      if (!attributes) continue
      const id = levelKey(attribute(attributes, floorField))
      if (!id) continue
      const mapped = mappings.get(id)
      if (!mapped) continue
      if (levelNumber(attributes.levelOrdinal) == null) attributes.levelOrdinal = mapped.ordinal
      if (levelNumber(attributes.level) == null) attributes.level = mapped.ordinal
      if (typeof attributes.levelName !== 'string' || !attributes.levelName.trim()) {
        attributes.levelName = mapped.name
      }
      stamped = true
    }
  }
  return stamped
}

/** A floor catalog is one row per floor, referenced by another layer. Used
 * when the published floor clause is already gone. Indoor hints only, so a
 * travel join is not turned into a floor list.
 */
function stampFloorCatalog (
  layers: Array<SnapshotLayer & { features?: SnapshotFeature[] }>,
  mapTypes?: readonly SnapshotMapTypeHint[]
): void {
  const indoor = mapTypes?.some((hint) => String(hint.mapType || '').toLowerCase() === 'indoor')
    || layers.some((layer) => Boolean(layer.floorInfo?.field))
  if (!indoor) return
  for (const catalog of layers) {
    const rows = catalog.features || []
    if (rows.length < 2 || rows.length > 50) continue
    const objectId = catalog.objectIdField?.toUpperCase()
    for (const idField of candidateIdFields(catalog, objectId)) {
      const orderField = orderFieldOf(catalog, idField)
      if (!orderField) continue
      const mappings = floorMappings(catalog, idField, orderField)
      if (mappings.size < 2 || mappings.size > 50) continue
      const ordinals = [...mappings.values()].map((item) => item.ordinal)
      if (ordinals.some((ordinal) => Math.abs(ordinal) > 200)) continue
      const referenced = layers.some((layer) =>
        layer !== catalog &&
        (layer.features?.length || 0) > mappings.size &&
        matchingFloorIds(layer, idField, mappings) >= 2
      )
      if (!referenced) continue
      applyFloorMappings(layers, idField, mappings)
      catalog.floorCatalog = true
      if (!catalog.floorInfo?.field) catalog.floorInfo = { field: idField }
      return
    }
  }
}

function candidateIdFields (
  layer: SnapshotLayer & { features?: SnapshotFeature[] },
  objectId?: string
): string[] {
  const names = new Set<string>()
  eachField(layer.fields, (field) => {
    if (field?.name) names.add(field.name)
  })
  for (const feature of layer.features || []) {
    for (const key of Object.keys(feature.attributes || {})) names.add(key)
  }
  const rows = layer.features || []
  return [...names].filter((name) => {
    if (objectId && name.toUpperCase() === objectId) return false
    if (/^(OBJECTID|FID|levelOrdinal|level|levelName)$/i.test(name)) return false
    const values = new Set<string>()
    for (const feature of rows) {
      const id = levelKey(attribute(feature.attributes || {}, name))
      if (!id) return false
      values.add(id)
    }
    return values.size === rows.length
  })
}

function matchingFloorIds (
  layer: SnapshotLayer & { features?: SnapshotFeature[] },
  floorField: string,
  mappings: Map<string, { ordinal: number, name: string }>
): number {
  let matched = 0
  for (const feature of layer.features || []) {
    const id = levelKey(attribute(feature.attributes || {}, floorField))
    if (id && mappings.has(id)) matched += 1
  }
  return matched
}

function attribute (attributes: Record<string, unknown>, field: string): unknown {
  if (field in attributes) return attributes[field]
  const target = field.toUpperCase()
  for (const key of Object.keys(attributes)) {
    if (key.toUpperCase() === target) return attributes[key]
  }
  return undefined
}

function floorFieldsFromSnapshots (layers: readonly SnapshotLayer[]): string[] {
  const fields: string[] = []
  const seen = new Set<string>()
  const add = (field?: string) => {
    if (!field || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) return
    const key = field.toUpperCase()
    if (seen.has(key)) return
    seen.add(key)
    fields.push(field)
  }
  const selectors: string[] = []
  const clauseLayers = new Map<string, { name: string, count: number }>()
  for (const layer of layers) {
    add(layer.floorInfo?.field)
    const named = new Set<string>()
    for (const field of expressionFieldNames(layer.definitionExpression)) {
      selectors.push(field)
      const key = field.toUpperCase()
      if (named.has(key)) continue
      named.add(key)
      const entry = clauseLayers.get(key) || { name: field, count: 0 }
      entry.count += 1
      clauseLayers.set(key, entry)
    }
  }
  // Two layers publishing the same floor clause is the floor field, even
  // before their field collections have loaded.
  for (const entry of clauseLayers.values()) {
    if (entry.count >= 2) add(entry.name)
  }
  for (const field of selectors) {
    if (layers.filter((layer) => hasField(layer, field)).length >= 2) add(field)
  }
  return fields
}

/** The floor field this layer's own filter names, once its fields have loaded. */
function ownFloorField (layer: SnapshotLayer): string | undefined {
  if (layer.floorInfo?.field) return layer.floorInfo.field
  for (const name of expressionFieldNames(layer.definitionExpression)) {
    if (hasField(layer, name)) return name
  }
  return undefined
}

function isFloorLayer (layer: SnapshotLayer, floorFields: readonly string[]): boolean {
  if (floorFields.some((field) => hasField(layer, field))) return true
  const named = new Set(expressionFieldNames(layer.definitionExpression).map((name) => name.toUpperCase()))
  return floorFields.some((field) => named.has(field.toUpperCase()))
}

function orderFieldOf (layer: SnapshotLayer, floorField: string): string | undefined {
  const rows = layer.features || []
  if (!rows.length) return undefined
  const objectId = layer.objectIdField?.toUpperCase()
  const names = new Set<string>()
  eachField(layer.fields, (field) => {
    if (field?.name) names.add(field.name)
  })
  for (const feature of rows) {
    for (const key of Object.keys(feature.attributes || {})) names.add(key)
  }
  let best: { name: string, span: number, min: number } | undefined
  for (const name of names) {
    if (!name || name.toUpperCase() === floorField.toUpperCase()) continue
    if (objectId && name.toUpperCase() === objectId) continue
    const byFloor = new Map<string, number>()
    const used = new Set<number>()
    let ok = true
    for (const feature of rows) {
      const attributes = feature.attributes || {}
      const id = levelKey(attribute(attributes, floorField))
      const ordinal = levelNumber(attribute(attributes, name))
      if (!id || ordinal == null) {
        ok = false
        break
      }
      const previous = byFloor.get(id)
      if (previous != null && previous !== ordinal) {
        ok = false
        break
      }
      byFloor.set(id, ordinal)
    }
    if (!ok || !byFloor.size) continue
    for (const ordinal of byFloor.values()) {
      if (used.has(ordinal)) {
        ok = false
        break
      }
      used.add(ordinal)
    }
    if (!ok) continue
    const nums = [...used]
    const span = Math.max(...nums) - Math.min(...nums)
    const min = Math.min(...nums)
    if (!best || span < best.span || (span === best.span && min < best.min)) {
      best = { name, span, min }
    }
  }
  return best?.name
}

/**
 * Min and max of every numeric field on the service, not the 200-feature page.
 * Class breaks built from the page leave the rest of the layer uncolored.
 */
async function attachFieldExtents (
  layer: SnapshotLayer,
  copy: SnapshotLayer & { features?: SnapshotFeature[] }
): Promise<void> {
  const features = copy.features
  if (!features?.length || typeof layer.createQuery !== 'function' || typeof layer.queryFeatures !== 'function') return
  const fields = numericFields(features)
  if (!fields.length) return
  try {
    const query = layer.createQuery()
    query.where = '1=1'
    query.returnGeometry = false
    query.outStatistics = fields.flatMap((field) => [
      { onStatisticField: field, outStatisticFieldName: `${field}__min`, statisticType: 'min' },
      { onStatisticField: field, outStatisticFieldName: `${field}__max`, statisticType: 'max' }
    ])
    const result = await layer.queryFeatures(query)
    const stats = result?.features?.[0]?.attributes
    if (!stats) return
    const extents: Record<string, { min: number, max: number }> = {}
    for (const field of fields) {
      const min = Number(stats[`${field}__min`])
      const max = Number(stats[`${field}__max`])
      if (Number.isFinite(min) && Number.isFinite(max)) extents[field] = { min, max }
    }
    if (Object.keys(extents).length) {
      (copy as SnapshotLayer & { fieldExtents?: Record<string, { min: number, max: number }> }).fieldExtents = extents
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Audiom field extent query failed', copy.title || copy.id, error)
  }
}

function numericFields (features: SnapshotFeature[]): string[] {
  const names = new Set<string>()
  for (const feature of features) {
    for (const [key, value] of Object.entries(feature.attributes || {})) {
      if (key === 'OBJECTID' || key === 'objectid' || key === 'FID' || key === 'fid') continue
      const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
      if (Number.isFinite(numeric)) names.add(key)
    }
  }
  return [...names]
}

/**
/** Audiom pattern tokens. Unknown tokens fall back to dots, matching Audiom's legend. */
export { PATTERN_TOKENS as AUDIOM_PATTERN_TOKENS, patternToken } from './patternTiles'

function layerHasRules (layer: SnapshotLayer & { features?: SnapshotFeature[] }): boolean {
  const features = layer.features
  if (!features?.length) return false
  return features.some((feature) => {
    const attributes = feature.attributes || {}
    return attributes.fill != null || attributes.stroke != null || attributes['fill-pattern'] != null
  })
}

function layerHasFeatures (layer: SnapshotLayer & { features?: SnapshotFeature[] }): boolean {
  return Boolean(layer.features?.length)
}

function featureRecord (
  dataSourceId: string,
  layerId: string,
  layer: SnapshotLayer,
  feature: SnapshotFeature,
  navigable: boolean
): RecordSnapshot | null {
  const geometry = serializeGeometry(layer.geometryType, feature.geometry)
  // A meter ring is not a plot. Audiom would treat it as longitude and the
  // indicator would never be inside it.
  if (!geometry || !geometryIsGeographic(geometry)) return null
  const attributes = feature.attributes || {}
  const objectId = layer.objectIdField ? attributes[layer.objectIdField] : attributes.OBJECTID ?? attributes.objectid
  const recordId = objectId != null ? String(objectId) : `${layerId}-${recordsFallbackId(feature)}`
  const styled = styleAttributes(attributes)
  // A rules file already named the plot, including level suffixes. Do not
  // replace that with the raw popup title. The type-column fallback below is
  // not a rules file.
  const ruled = styled.ruleType != null || styled.ruleName != null
  // Audiom looks up step files by category, then by name. A plain Esri layer
  // has no ruleType, so use its type column. The spoken title is not a file.
  if (styled.ruleType == null) {
    const category = featureCategory(attributes, layer)
    if (category) styled.ruleType = category
  }
  if (!ruled || !styled.name) {
    const label = graphicName({
      attributes,
      layer: {
        title: layer.title,
        displayField: layer.displayField,
        objectIdField: layer.objectIdField,
        popupTemplate: layer.popupTemplate
      }
    }) ?? featureLabel(attributes, layer)
    if (label) styled.name = label
  }
  // The floor catalog covers every room. The rules file excludes Level, and
  // this layer has no use type, so the step must not say "Levels: Level 1".
  if (layer.floorCatalog) styled.ruleType = 'level'
  return {
    key: { dataSourceId, layerId, recordId },
    sourceId: layerId,
    attributes: styled,
    geometry,
    navigable
  }
}

let fallbackSerial = 0
function recordsFallbackId (feature: SnapshotFeature): string {
  const name = featureLabel(feature.attributes || {})
  if (name != null) return name
  fallbackSerial += 1
  return String(fallbackSerial)
}

const NAME_FIELDS = ['name', 'Name', 'NAME', 'title', 'Title', 'TITLE', 'label', 'Label', 'LABEL']

/** Columns a plain layer uses for the kind of place, not its spoken title. */
const CATEGORY_FIELDS = [
  'ruleType', 'RuleType', 'type', 'Type', 'TYPE', 'category', 'Category',
  'CATEGORY', 'class', 'Class', 'CLASS', 'fclass', 'amenity', 'Amenity',
  'landuse', 'Landuse', 'LANDUSE'
]

/** First human-readable attribute. Does not invent a name from the object id. */
function featureLabel (
  attributes: Record<string, unknown>,
  layer?: SnapshotLayer & { displayField?: string }
): string | null {
  const displayField = layer?.displayField
  const fields = displayField ? [displayField, ...NAME_FIELDS] : NAME_FIELDS
  for (const field of fields) {
    const value = attributes[field]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && field !== layer?.objectIdField) return String(value)
  }
  return null
}

/** A short category such as park or road. Skips the column used as the title. */
function featureCategory (
  attributes: Record<string, unknown>,
  layer?: SnapshotLayer & { displayField?: string, typeIdField?: string }
): string | null {
  const fields = layer?.typeIdField
    ? [layer.typeIdField, ...CATEGORY_FIELDS]
    : CATEGORY_FIELDS
  for (const field of fields) {
    if (field === layer?.displayField) continue
    const value = attributes[field]
    if (typeof value !== 'string') continue
    const category = value.trim()
    if (!category || category.length > 40 || /\s/.test(category)) continue
    return category
  }
  return null
}

type StyleValue = string | number | boolean | null

const STYLE_KEYS = [
  'fill', 'stroke', 'stroke-width', 'fill-pattern', 'fill-opacity',
  'stroke-opacity', 'stroke-dasharray'
]

/**
 * Text Audiom uses to pick a step file: id, then name, then ruleName, then
 * ruleType. A spoken title is not a soundpack file, so the category has to
 * survive the snapshot or every step is silent.
 */
const SOUND_KEYS = [
  'id', 'ruleType', 'ruleName', 'ruleNamePlural', 'soundPriority',
  'shortSoundPath', 'ambientSoundPath', 'interiorAmbientSoundPath', 'introSoundPath',
  'stepSoundPath', 'loopSoundPath', 'shortSound', 'loopSound', 'introSound'
]

/** Floor membership. levelOrdinal is numeric and survives the number copy; the name does not. */
const LEVEL_KEYS = ['levelName', 'passable']

/**
 * Keep rule outputs Audiom already computed, plus the numeric columns a
 * heatmap quantizes. Do not invent colors or patterns.
 */
function styleAttributes (attributes: Record<string, unknown>): Record<string, StyleValue> {
  const kept: Record<string, StyleValue> = {}
  putStyle(kept, 'name', typeof attributes.name === 'string' ? attributes.name : attributes.Name)
  putStyle(kept, 'Name', attributes.Name)
  for (const key of STYLE_KEYS) putStyle(kept, key, attributes[key])
  for (const key of SOUND_KEYS) putStyle(kept, key, attributes[key])
  for (const key of LEVEL_KEYS) putStyle(kept, key, attributes[key])
  for (const [key, value] of Object.entries(attributes)) {
    if (kept[key] != null) continue
    const numeric = typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN
    if (!Number.isFinite(numeric)) continue
    // A parcel column is not an Audiom step bound. Copying minstep or
    // maxstep hides the plot, and the step then says Empty Space.
    if (key === 'minstep' || key === 'maxstep') {
      kept[`_${key}`] = numeric
      continue
    }
    kept[key] = numeric
  }
  return kept
}

function putStyle (kept: Record<string, StyleValue>, name: string, value: unknown): void {
  if (typeof value === 'string') kept[name] = `${value}`
  else if (typeof value === 'number') kept[name] = Number(value)
  else if (typeof value === 'boolean') kept[name] = Boolean(value)
}

function serializeGeometry (
  geometryType: string | undefined,
  geometry: SnapshotFeature['geometry']
): RecordSnapshot['geometry'] {
  if (!geometry) return null
  const point = pointCoordinates(geometry)
  if ((geometryType === 'point' || geometry.type === 'point') && point) {
    return { type: GeometryFamily.Point, coordinates: point }
  }
  if ((geometryType === 'polyline' || geometry.paths) && geometry.paths?.length) {
    const paths = geometry.paths.filter((path) => path.length > 1)
    if (!paths.length) return null
    if (paths.length === 1) return { type: GeometryFamily.LineString, coordinates: paths[0] }
    return { type: GeometryFamily.MultiLineString, coordinates: paths }
  }
  if ((geometryType === 'polygon' || geometry.rings) && geometry.rings?.length) {
    const rings = geometry.rings.filter((ring) => ring.length > 2)
    if (!rings.length) return null
    return ringsToPolygon(rings)
  }
  return null
}

/**
 * Esri packs every part and hole of a polygon into one `rings` array. Keeping
 * only the first ring dropped every other part, so a tract made of several
 * pieces said Empty Space wherever the indicator was not over the first piece.
 * Outer rings are clockwise; holes are counter-clockwise and nest in the outer
 * ring that contains them. Audiom rewinds the result, so only topology matters.
 */
function ringsToPolygon (rings: number[][][]): RecordSnapshot['geometry'] {
  const outers: number[][][][] = []
  const holes: number[][][] = []
  for (const ring of rings) {
    if (ringIsClockwise(ring)) outers.push([ring])
    else holes.push(ring)
  }
  if (!outers.length) {
    // No clockwise ring means the winding is non-standard. Keep every ring as
    // its own part so coverage is never dropped and no step says Empty Space.
    if (rings.length === 1) return { type: GeometryFamily.Polygon, coordinates: [rings[0]] }
    return { type: GeometryFamily.MultiPolygon, coordinates: rings.map((ring) => [ring]) }
  }
  for (const hole of holes) {
    const owner = outers.find((polygon) => pointInRing(hole[0], polygon[0]))
    if (owner) owner.push(hole)
    else outers.push([hole])
  }
  if (outers.length === 1) return { type: GeometryFamily.Polygon, coordinates: outers[0] }
  return { type: GeometryFamily.MultiPolygon, coordinates: outers }
}

/** Shoelace sign. Esri outer rings wind clockwise. */
function ringIsClockwise (ring: number[][]): boolean {
  let total = 0
  for (let i = 0; i < ring.length - 1; i += 1) {
    total += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1])
  }
  return total >= 0
}

function pointInRing (point: number[], ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const hit = yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
    if (hit) inside = !inside
  }
  return inside
}

function pointCoordinates (geometry: NonNullable<SnapshotFeature['geometry']>): number[] | null {
  if (typeof geometry.longitude === 'number' && typeof geometry.latitude === 'number') {
    return [geometry.longitude, geometry.latitude]
  }
  if (typeof geometry.x === 'number' && typeof geometry.y === 'number') {
    return [geometry.x, geometry.y]
  }
  return null
}

const WEB_MERCATOR_HALF = 20037508.342789244

function isWebMercatorWkid (wkid?: number): boolean {
  return wkid === 102100 || wkid === 3857 || wkid === 102113
}

/** A floor query can ignore outSpatialReference and return Web Mercator meters
 * while the layer still says 4326. Dropping those rings is why Units and Levels
 * count 0. Convert that known CRS; leave any other projected CRS alone.
 */
function shouldTreatAsWebMercator (layer: SnapshotLayer, features: SnapshotFeature[]): boolean {
  const wkid = layer.spatialReference?.latestWkid || layer.spatialReference?.wkid
  if (isWebMercatorWkid(wkid)) return true
  if (wkid && wkid !== 4326 && wkid !== 84) return false
  return features.some((feature) => feature.geometry && !featureIsGeographic(feature))
}

function mercatorToLonLat (x: number, y: number): [number, number] {
  const lon = (x / WEB_MERCATOR_HALF) * 180
  const lat = (Math.atan(Math.exp((y / WEB_MERCATOR_HALF) * Math.PI)) * 360) / Math.PI - 90
  return [lon, lat]
}

function convertMercatorPosition (position: number[]): number[] {
  const [lon, lat] = mercatorToLonLat(position[0], position[1])
  return position.length > 2 ? [lon, lat, ...position.slice(2)] : [lon, lat]
}

function convertMercatorGeometry (geometry: SnapshotFeature['geometry']): SnapshotFeature['geometry'] {
  if (!geometry) return geometry
  if (typeof geometry.x === 'number' && typeof geometry.y === 'number') {
    const [x, y] = mercatorToLonLat(geometry.x, geometry.y)
    return { ...geometry, x, y }
  }
  return {
    ...geometry,
    paths: geometry.paths?.map((path) => path.map(convertMercatorPosition)),
    rings: geometry.rings?.map((ring) => ring.map(convertMercatorPosition))
  }
}

function asWebMercator (features: SnapshotFeature[]): SnapshotFeature[] {
  return features.map((feature) => (
    !feature.geometry || featureIsGeographic(feature)
      ? feature
      : { ...feature, geometry: convertMercatorGeometry(feature.geometry) }
  ))
}

/**
 * A query can ignore outSpatialReference and return projected meters.
 * Audiom's ENU projection only accepts longitude and latitude. Web Mercator
 * is converted here when the ArcGIS projection module is missing, so a floor
 * layer is not counted as 0.
 */
async function geographicFeatures (
  layer: SnapshotLayer,
  features: SnapshotFeature[]
): Promise<SnapshotFeature[]> {
  if (!features.length || features.every(featureIsGeographic)) return features
  const source = layer.spatialReference
  try {
    const loaded = await loadMapModules(['esri/geometry/projection', 'esri/geometry/SpatialReference'])
    const projection = loaded[0] as {
      load?: () => Promise<unknown>
      project: (geometry: unknown, spatialReference: unknown) => SnapshotFeature['geometry']
    } | undefined
    const SpatialReference = loaded[1] as (new (properties: { wkid: number }) => unknown) | undefined
    if (projection && SpatialReference && source) {
      if (typeof projection.load === 'function') await projection.load()
      const geographic = new SpatialReference({ wkid: 4326 })
      const projected = features.flatMap((feature) => {
        if (!feature.geometry || featureIsGeographic(feature)) return [feature]
        const next = projection.project({ ...feature.geometry, spatialReference: source }, geographic)
        if (!next || !featureIsGeographic({ geometry: next })) return []
        return [{ ...feature, geometry: next }]
      })
      if (projected.length === features.length) return projected
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Audiom could not project layer', layer.title || layer.id, error)
  }
  if (!shouldTreatAsWebMercator(layer, features)) return []
  return asWebMercator(features)
}

function featureIsGeographic (feature: SnapshotFeature): boolean {
  const geometry = feature.geometry
  if (!geometry) return true
  const positions = [
    ...(typeof geometry.x === 'number' ? [[geometry.x, geometry.y || 0]] : []),
    ...(geometry.paths || []).flat(),
    ...(geometry.rings || []).flat()
  ]
  return positions.every((position) => Math.abs(position[0]) <= 180 && Math.abs(position[1]) <= 90)
}
/**
 * The query can ignore outSpatialReference. Convert any remaining meter
 * ring here, using the layer's own spatial reference. A ring that is still
 * meters after that is not a plot.
 */
async function projectLoadedFeatures (layers: SnapshotLayer[]): Promise<void> {
  const pending = layers.filter((layer) =>
    layer.features?.some((feature) => feature.geometry && !featureIsGeographic(feature))
  )
  for (const layer of pending) {
    layer.features = await geographicFeatures(layer, layer.features || [])
  }
}


function geometryIsGeographic (geometry: NonNullable<RecordSnapshot['geometry']>): boolean {
  const nested = geometry.coordinates as unknown
  const positions: number[][] = []
  const walk = (value: unknown): void => {
    if (!Array.isArray(value) || !value.length) return
    if (typeof value[0] === 'number') {
      positions.push(value as number[])
      return
    }
    value.forEach(walk)
  }
  walk(nested)
  return positions.length > 0 && positions.every((position) =>
    Math.abs(position[0]) <= 180 && Math.abs(position[1]) <= 90
  )
}
