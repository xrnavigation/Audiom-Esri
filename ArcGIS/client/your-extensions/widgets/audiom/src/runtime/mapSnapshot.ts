import {
  GeometryFamily,
  LayerDisposition,
  type MapSnapshot,
  type RecordSnapshot,
  type SourceSnapshot,
  SourceStatus
} from '../../../../shared/audiom-runtime/src/types'
import { isDataSourceLayerType } from '../utils/mapEnums'

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
  createQuery?: () => { where?: string, outFields?: string[], returnGeometry?: boolean, num?: number }
  queryFeatures?: (query: unknown) => Promise<{ features?: SnapshotFeature[] }>
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
    const sourceId = layer.id || layer.title || 'layer'
    const supported = isDataSourceLayerType(layer.type || '')
    const hidden = layer.visible === false
    const outOfScale = layer.scaleVisible === false
    // Hidden features leave the navigable set. Out-of-scale features stay
    // navigable. A visible layer with no rules is visual-only: not in the audio map.
    const bound = supported && !hidden && layerHasRules(layer)
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
    // Out of scale stays navigable. A visible layer without rules is described, not entered.
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
  layers.forEach((layer) => {
    const copy: SnapshotLayer & { features?: SnapshotFeature[] } = { ...layer }
    loaded.push(copy)
    if (!layer.queryFeatures || !layer.createQuery || layer.visible === false) return
    if (!isDataSourceLayerType(layer.type || '')) return
    const query = layer.createQuery()
    query.returnGeometry = true
    query.outFields = ['*']
    query.num = FEATURE_LIMIT
    pending.push(
      layer.queryFeatures(query).then((result) => {
        copy.features = result.features || []
      }).catch(() => {
        copy.features = []
      })
    )
  })
  await Promise.all(pending)
  const view = {
    map: { allLayers: { forEach: (fn: (layer: SnapshotLayer) => void) => { loaded.forEach(fn) } } }
  }
  const snapshot = snapshotFromMapView({ map: view.map }, dataSourceId)
  ;(snapshot as MapSnapshot & { queriedLayers?: SnapshotLayer[] }).queriedLayers = loaded
  return snapshot
}

/** Audiom pattern tokens. Unknown tokens fall back to dots, matching Audiom's legend. */
export const AUDIOM_PATTERN_TOKENS = [
  'dot-pattern',
  'empty-square-pattern',
  'grid-pattern',
  'diagonal-line-pattern',
  'caret-pattern'
] as const

export function patternToken (value: unknown): string {
  return typeof value === 'string' && (AUDIOM_PATTERN_TOKENS as readonly string[]).includes(value)
    ? value
    : 'dot-pattern'
}

function layerHasRules (layer: SnapshotLayer & { features?: SnapshotFeature[] }): boolean {
  const features = layer.features
  if (!features?.length) return false
  return features.some((feature) => {
    const attributes = feature.attributes || {}
    return attributes.fill != null || attributes.stroke != null || attributes['fill-pattern'] != null
  })
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
  return {
    key: { dataSourceId, layerId, recordId },
    sourceId: layerId,
    attributes: styleAttributes(attributes),
    geometry,
    navigable
  }
}

let fallbackSerial = 0
function recordsFallbackId (feature: SnapshotFeature): string {
  const name = feature.attributes?.name ?? feature.attributes?.Name
  if (name != null) return String(name)
  fallbackSerial += 1
  return String(fallbackSerial)
}

/** Keep rule outputs Audiom already computed. Do not invent colors or patterns. */
function styleAttributes (
  attributes: Record<string, unknown>
): Record<string, string | number | boolean | null> {
  const kept: Record<string, string | number | boolean | null> = {}
  const names = ['name', 'Name', 'fill', 'stroke', 'fill-pattern', 'fill-opacity', 'stroke-opacity', 'stroke-dasharray']
  for (const name of names) {
    const value = attributes[name]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      kept[name] = value
    }
  }
  if (kept.name == null && typeof attributes.Name === 'string') kept.name = attributes.Name
  return kept
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
