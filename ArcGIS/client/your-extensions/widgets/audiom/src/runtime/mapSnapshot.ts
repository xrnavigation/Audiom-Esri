import {
  GeometryFamily,
  LayerDisposition,
  type MapSnapshot,
  type RecordSnapshot,
  type SourceSnapshot,
  SourceStatus
} from '../../../../shared/audiom-runtime/src/types'
import { isDataSourceLayerType } from '../utils/mapEnums'
import { graphicName, loadMapModules } from './esriMapSurface'

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
    outStatistics?: Array<{
      onStatisticField?: string
      outStatisticFieldName?: string
      statisticType?: string
    }>
  }
  queryFeatures?: (query: unknown) => Promise<{ features?: SnapshotFeature[] }>
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
  if (!layers) return { sources, records }

  layers.forEach((layer) => {
    if (isInternalLayer(layer)) return
    const sourceId = layer.id || layer.title || 'layer'
    const supported = !isRasterLayer(layer) && (
      isDataSourceLayerType(layer.type || '') ||
      (typeof layer.queryFeatures === 'function' && typeof layer.createQuery === 'function')
    )
    const hidden = layer.visible === false
    const outOfScale = layer.scaleVisible === false
    // A visible operational layer is a data source even before its features
    // are queried. Rule colors are painted later and must not hide the layer.
    const bound = supported && !hidden
    sources.push({
      sourceId,
      displayName: layer.title || sourceId,
      geometryFamily: FAMILY_BY_TYPE[layer.geometryType || ''] || null,
      mapType: mapTypeForLayer(layer, mapTypes),
      rulesRef: null,
      disposition: bound ? LayerDisposition.Bound : LayerDisposition.VisualOnly,
      recordCount: 0,
      status: SourceStatus.Complete
    })
    if (!supported || hidden) return
    const features = (layer as SnapshotLayer & { features?: SnapshotFeature[] }).features
    if (!features?.length) return
    // Out of scale stays navigable. Visible queried features are listed too.
    const navigable = supported && (bound || outOfScale)
    for (const feature of features.slice(0, FEATURE_LIMIT)) {
      const record = featureRecord(dataSourceId, sourceId, layer, feature, navigable)
      if (record) records.push(record)
    }
  })
  for (const source of sources) {
    source.recordCount = records.filter((record) => record.sourceId === source.sourceId).length
  }
  return { sources, records }
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
}

/** Audiom map types. 'standard' is not one of them and becomes travel. */
function audiomMapType (value: string | undefined): string {
  if (value === 'heatmap' || value === 'indoor' || value === 'travel') return value
  return 'travel'
}

function mapTypeForLayer (
  layer: SnapshotLayer,
  hints: readonly SnapshotMapTypeHint[] | undefined
): string {
  if (!hints?.length) return 'travel'
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
  return 'travel'
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
    layer.layers?.forEach((child) => queue.push(child))
    layer.sublayers?.forEach((child) => queue.push(child))
    // Basemap base and reference layers (terrain hillshade, say) ride in
    // allLayers but carry no features. Drop them before a force-load; the
    // hillshade tile service can hang and stall the whole snapshot.
    // Identity misses when allLayers holds a wrapper of the basemap layer.
    if (isBasemapMember(layer, basemapLayers)) continue
    const copy = layerCopy(layer)
    loaded.push(copy)
    if (isInternalLayer(layer)) continue
    if (layer.visible === false) continue
    if (typeof layer.queryFeatures !== 'function' || typeof layer.createQuery !== 'function') continue
    pending.push(queryLayerFeatures(layer, copy, viewExtent ?? jimuMapView?.view?.extent, indicator))
  }
  await Promise.all(pending)
  await projectLoadedFeatures(loaded)
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

/** The avatar marker, basemap tiles, and rasters are not feature data sources. */
function isInternalLayer (layer: SnapshotLayer): boolean {
  if (layer.id === 'audiom-avatar' || layer.listMode === 'hide') return true
  if (layer.isBasemap) return true
  return isRasterLayer(layer)
}

/**
 * Imagery layers expose queryFeatures, then reject it. They are pictures,
 * not features, and must not be listed or queried.
 */
function isRasterLayer (layer: SnapshotLayer): boolean {
  const type = layer.type || ''
  return type === 'tile' || type === 'vector-tile' || type === 'imagery' ||
    type === 'imagery-tile' || type === 'georeferenced-image' ||
    type === 'web-tile' || type === 'base-tile' || type === 'open-street-map' ||
    type === 'bing-maps' || type === 'base-dynamic' || type === 'wcs' ||
    type === 'elevation' || type === 'media'
}

/** Wait for the layer, then query. A layer that is still loading has no features yet. */
async function queryLayerFeatures (
  layer: SnapshotLayer,
  copy: SnapshotLayer & { features?: SnapshotFeature[] },
  viewExtent?: unknown,
  indicator?: { longitude: number, latitude: number }
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
  copy.popupTemplate = layer.popupTemplate?.title ? { title: layer.popupTemplate.title } : copy.popupTemplate
  copy.fields = fieldCatalog(layer.fields)
  copy.objectIdField = layer.objectIdField
  // Load also settles the type. A raster whose type was blank when it was
  // queued is a picture, not a feature source, and must not be queried.
  if (isRasterLayer(layer) || typeof layer.queryFeatures !== 'function' || typeof layer.createQuery !== 'function') {
    copy.features = []
    return
  }
  try {
    const query = layer.createQuery()
    query.where = query.where || '1=1'
    query.returnGeometry = true
    query.outFields = ['*']
    // Audiom stores longitude and latitude. A web map in Web Mercator
    // otherwise returns meters, which the ENU projection rejects.
    // The first 200 features in the service are not the tracts under the
    // indicator. Intersect the current view so the page is the map on screen.
    if (viewExtent) {
      query.geometry = viewExtent
      query.spatialRelationship = 'intersects'
    }
    query.outSpatialReference = { wkid: 4326 }
    query.num = FEATURE_LIMIT
    const result = await layer.queryFeatures(query)
    const page = result?.features || []
    // The view page is still capped at 200. The tract under the indicator
    // must be in the snapshot or the step says Empty Space.
    const standing = await featuresAtIndicator(layer, indicator)
    copy.features = await geographicFeatures(layer, mergeFeatures(page, standing))
    await attachFieldExtents(layer, copy)
    if (!copy.features.length) {
      // eslint-disable-next-line no-console
      console.error('Audiom layer query returned no features', copy.title || copy.id, copy.type)
    }
  } catch (error) {
    copy.features = []
    // eslint-disable-next-line no-console
    console.error('Audiom layer query failed', copy.title || copy.id, error)
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
  // The tooltip names the plot from the popup title and owner/name columns.
  // Voice-over reads attributes.name. Store that same title, or a step says
  // Empty Space on a plot whose name is not in a column called name.
  const label = graphicName({
    attributes,
    layer: {
      displayField: layer.displayField,
      objectIdField: layer.objectIdField,
      popupTemplate: layer.popupTemplate
    }
  }) ?? featureLabel(attributes, layer)
  if (label) styled.name = label
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

type StyleValue = string | number | boolean | null

const STYLE_KEYS = [
  'fill', 'stroke', 'stroke-width', 'fill-pattern', 'fill-opacity',
  'stroke-opacity', 'stroke-dasharray'
]

/**
 * Keep rule outputs Audiom already computed, plus the numeric columns a
 * heatmap quantizes. Do not invent colors or patterns.
 */
function styleAttributes (attributes: Record<string, unknown>): Record<string, StyleValue> {
  const kept: Record<string, StyleValue> = {}
  putStyle(kept, 'name', typeof attributes.name === 'string' ? attributes.name : attributes.Name)
  putStyle(kept, 'Name', attributes.Name)
  for (const key of STYLE_KEYS) putStyle(kept, key, attributes[key])
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

/**
 * A query can ignore outSpatialReference and return projected meters.
 * Audiom's ENU projection only accepts longitude and latitude, so project
 * those meters with the layer's own spatial reference. Do not guess a CRS.
 */
async function geographicFeatures (
  layer: SnapshotLayer,
  features: SnapshotFeature[]
): Promise<SnapshotFeature[]> {
  const source = layer.spatialReference
  const wkid = source?.latestWkid || source?.wkid
  if (!features.length || !source || wkid === 4326 || wkid === 84) return features
  if (features.every(featureIsGeographic)) return features
  try {
    const loaded = await loadMapModules(['esri/geometry/projection', 'esri/geometry/SpatialReference'])
    const projection = loaded[0] as {
      load?: () => Promise<unknown>
      project: (geometry: unknown, spatialReference: unknown) => SnapshotFeature['geometry']
    } | undefined
    const SpatialReference = loaded[1] as (new (properties: { wkid: number }) => unknown) | undefined
    if (!projection || !SpatialReference) return features
    if (typeof projection.load === 'function') await projection.load()
    const geographic = new SpatialReference({ wkid: 4326 })
    return features.flatMap((feature) => {
      if (!feature.geometry || featureIsGeographic(feature)) return [feature]
      const projected = projection.project({ ...feature.geometry, spatialReference: source }, geographic)
      if (!projected || !featureIsGeographic({ geometry: projected })) return []
      return [{ ...feature, geometry: projected }]
    })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Audiom could not project layer', layer.title || layer.id, error)
    // Meter rings are not plots. Keeping them makes every step say Empty Space.
    return []
  }
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
  if (!pending.length) return
  try {
    const loaded = await loadMapModules(['esri/geometry/projection', 'esri/geometry/SpatialReference'])
    const projection = loaded[0] as {
      load?: () => Promise<unknown>
      project: (geometry: unknown, spatialReference: unknown) => SnapshotFeature['geometry']
    } | undefined
    const SpatialReference = loaded[1] as (new (properties: { wkid: number }) => unknown) | undefined
    if (!projection || !SpatialReference) return
    if (typeof projection.load === 'function') await projection.load()
    const geographic = new SpatialReference({ wkid: 4326 })
    const webMercator = new SpatialReference({ wkid: 3857 })
    for (const layer of pending) {
      const source = layer.spatialReference
      const wkid = source?.latestWkid || source?.wkid
      const from = source && wkid !== 4326 && wkid !== 84 ? source : webMercator
      layer.features = (layer.features || []).flatMap((feature) => {
        if (!feature.geometry || featureIsGeographic(feature)) return [feature]
        const projected = projection.project(
          { ...feature.geometry, spatialReference: from },
          geographic
        )
        if (!projected || !featureIsGeographic({ geometry: projected })) return []
        return [{ ...feature, geometry: projected }]
      })
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Audiom could not project snapshot features', error)
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
