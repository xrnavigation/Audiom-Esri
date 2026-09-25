import {
  GeometryFamily,
  LayerDisposition,
  type MapSnapshot,
  type RecordSnapshot,
  type SourceSnapshot,
  SourceStatus
} from '../../../../shared/audiom-runtime/src/types'
import { isDataSourceLayerType } from '../utils/mapEnums'

export interface SnapshotLayer {
  id?: string
  title?: string
  type?: string
  visible?: boolean
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

/** The existing map is the visual surface. This only describes its layers. */
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
    const geometryType = (layer as { geometryType?: string }).geometryType
    sources.push({
      sourceId,
      displayName: layer.title || sourceId,
      geometryFamily: FAMILY_BY_TYPE[geometryType || ''] || null,
      mapType: 'standard',
      rulesRef: null,
      disposition: supported && layer.visible !== false
        ? LayerDisposition.Bound
        : LayerDisposition.VisualOnly,
      recordCount: 0,
      status: SourceStatus.Complete
    })
    if (!supported || layer.visible === false) return
    records.push(layerRecord(dataSourceId, sourceId))
  })
  return { sources, records }
}

function layerRecord (dataSourceId: string, layerId: string): RecordSnapshot {
  return {
    key: { dataSourceId, layerId, recordId: layerId },
    sourceId: layerId,
    attributes: {},
    geometry: null,
    navigable: false
  }
}
