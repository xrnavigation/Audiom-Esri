import {
  GeometryFamily,
  LayerDisposition,
  type MapSnapshot,
  type RecordSnapshot,
  type SourceSnapshot,
  SourceStatus
} from '../../../../shared/audiom-runtime/src/types'
import { isDataSourceLayerType } from '../utils/mapEnums'
import { loadMapModules } from './esriMapSurface'

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
  createQuery?: () => {
    where?: string
    outFields?: string[]
    returnGeometry?: boolean
    outSpatialReference?: { wkid: number }
    num?: number
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
  /** Test double. Production layers are read through queryFeatures. */
  features?: SnapshotFeature[]
  /** Esri spatial reference. Prototype getter; read it, do not spread the layer. */
  spatialReference?: { wkid?: number, latestWkid?: number, wkt?: string }
}

export interface SnapshotMapView {
  map?: {
    allLayers?: { forEach: (fn: (layer: SnapshotLayer) => void) => void }
  }
  view?: {
    map?: {
      allLayers?: { forEach: (fn: (layer: SnapshotLayer) => void) => void }
    }
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
  dataSourceId: string
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
      mapType: 'standard',
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
export async function snapshotFeaturesFromMapView (
  jimuMapView: SnapshotMapView | undefined,
  dataSourceId: string
): Promise<MapSnapshot> {
  const layers = jimuMapView?.view?.map?.allLayers || jimuMapView?.map?.allLayers
  if (!layers) return snapshotFromMapView(jimuMapView, dataSourceId)
  const loaded: SnapshotLayer[] = []
  const pending: Array<Promise<void>> = []
  const queue: SnapshotLayer[] = []
  layers.forEach((layer) => queue.push(layer))
  for (let index = 0; index < queue.length; index += 1) {
    const layer = queue[index]
    layer.layers?.forEach((child) => queue.push(child))
    layer.sublayers?.forEach((child) => queue.push(child))
    const copy = layerCopy(layer)
    loaded.push(copy)
    if (isInternalLayer(layer)) continue
    if (layer.visible === false) continue
    if (typeof layer.queryFeatures !== 'function' || typeof layer.createQuery !== 'function') continue
    pending.push(queryLayerFeatures(layer, copy))
  }
  await Promise.all(pending)
  const view = {
    map: { allLayers: { forEach: (fn: (layer: SnapshotLayer) => void) => { loaded.forEach(fn) } } }
  }
  const snapshot = snapshotFromMapView({ map: view.map }, dataSourceId)
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
    isBasemap: layer.isBasemap,
    listMode: layer.listMode,
    features: layer.features
  }
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
  copy: SnapshotLayer & { features?: SnapshotFeature[] }
): Promise<void> {
  try {
    if (typeof layer.when === 'function') await withTimeout(layer.when(), 8000)
    else if (typeof layer.load === 'function') await withTimeout(layer.load(), 8000)
  } catch (error) {
    copy.features = []
    // eslint-disable-next-line no-console
    console.error('Audiom could not load layer', copy.title || copy.id, error)
    return
  }
  // Load can publish fields that were missing when the layer was queued.
  copy.type = layer.type
  copy.geometryType = layer.geometryType
  copy.displayField = layer.displayField
  copy.objectIdField = layer.objectIdField
  if (typeof layer.queryFeatures !== 'function' || typeof layer.createQuery !== 'function') {
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
    query.outSpatialReference = { wkid: 4326 }
    query.num = FEATURE_LIMIT
    const result = await layer.queryFeatures(query)
    copy.features = await geographicFeatures(layer, result?.features || [])
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
  if (!geometry) return null
  const attributes = feature.attributes || {}
  const objectId = layer.objectIdField ? attributes[layer.objectIdField] : attributes.OBJECTID ?? attributes.objectid
  const recordId = objectId != null ? String(objectId) : `${layerId}-${recordsFallbackId(feature)}`
  const styled = styleAttributes(attributes)
  const label = featureLabel(attributes, layer)
  if (label && styled.name == null) styled.name = label
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

/** Keep rule outputs Audiom already computed. Do not invent colors or patterns. */
function styleAttributes (attributes: Record<string, unknown>): Record<string, StyleValue> {
  const kept: Record<string, StyleValue> = {}
  putStyle(kept, 'name', typeof attributes.name === 'string' ? attributes.name : attributes.Name)
  putStyle(kept, 'Name', attributes.Name)
  putStyle(kept, 'fill', attributes.fill)
  putStyle(kept, 'stroke', attributes.stroke)
  putStyle(kept, 'stroke-width', attributes['stroke-width'])
  putStyle(kept, 'fill-pattern', attributes['fill-pattern'])
  putStyle(kept, 'fill-opacity', attributes['fill-opacity'])
  putStyle(kept, 'stroke-opacity', attributes['stroke-opacity'])
  putStyle(kept, 'stroke-dasharray', attributes['stroke-dasharray'])
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
    return { type: GeometryFamily.Polygon, coordinates: [rings[0]] }
  }
  return null
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
    return features.map((feature) => {
      if (!feature.geometry || featureIsGeographic(feature)) return feature
      const projected = projection.project({ ...feature.geometry, spatialReference: source }, geographic)
      return projected ? { ...feature, geometry: projected } : feature
    })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Audiom could not project layer', layer.title || layer.id, error)
    return features
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
