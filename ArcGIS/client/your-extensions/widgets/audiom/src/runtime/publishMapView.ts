import type MapView from '@arcgis/core/views/MapView'
import type SceneView from '@arcgis/core/views/SceneView'
import { MapViewManager } from 'jimu-arcgis'
import type { MountedMapView } from './esriMapSurface'

/**
 * Experience Builder shows a widget in "Select a Map widget" when its
 * manifest sets `canCreateMapView`. Selecting it then reads the JimuMapView
 * that widget published. Audiom draws its own view, so it has to publish
 * that view under its widget id or Legend and the other map tools stay empty.
 */
const MAP_SOURCE_TYPES = new Set(['WEB_MAP', 'WEB_SCENE'])

export interface OwnedMapSource {
  dataSourceId?: string
  mainDataSourceId?: string
}

export function ownedMapDataSourceId (
  sources: ReadonlyArray<OwnedMapSource> | null | undefined,
  dataSources: Record<string, { type?: string } | null | undefined>
): string {
  const list = sources ? Array.from(sources) : []
  const idOf = (source: OwnedMapSource): string =>
    source.mainDataSourceId || source.dataSourceId || ''
  const mapSource = list.find((source) => {
    const id = idOf(source)
    return Boolean(id && MAP_SOURCE_TYPES.has(dataSources[id]?.type || ''))
  })
  if (mapSource) return idOf(mapSource)
  // Bundled mode connects exactly one web map or web scene. Its type is
  // sometimes not written yet when the view first mounts.
  if (list.length === 1) return idOf(list[0])
  return ''
}

/**
 * The surface keeps a structural view so tests never build a WebGL view.
 * The object is still the MapView or SceneView this API requires, and those
 * class types do not overlap the structural one, so the hop is required.
 */
function esriView (view: MountedMapView): MapView | SceneView {
  return view as unknown as MapView | SceneView
}

function mapViewManager (): MapViewManager | undefined {
  try {
    return MapViewManager.getInstance()
  } catch {
    return undefined
  }
}

/**
 * Register `view` as this widget's map view. The returned release must be
 * called with true only after the surface has destroyed the ArcGIS view.
 * Releasing a live view detaches its container.
 */
export function publishOwnedMapView (
  mapWidgetId: string,
  dataSourceId: string,
  view: MountedMapView
): (viewAlreadyDestroyed: boolean) => void {
  const manager = mapViewManager()
  const noop = (): void => undefined
  if (!manager || !mapWidgetId || !view) return noop
  const sourceId = dataSourceId || ''
  const jimuMapViewId = `${mapWidgetId}-${sourceId}`
  try {
    void Promise.resolve(manager.createJimuMapView({
      mapWidgetId,
      dataSourceId: sourceId,
      view: esriView(view),
      isActive: true,
      isEnablePopup: false,
      mapViewManager: manager
    })).catch((error: unknown) => {
      console.error('Audiom could not publish its map view', error)
    })
  } catch (error) {
    console.error('Audiom could not publish its map view', error)
    return noop
  }
  return (viewAlreadyDestroyed: boolean) => {
    if (!viewAlreadyDestroyed) return
    try {
      manager.destroyJimuMapView(jimuMapViewId)
    } catch (error) {
      console.error('Audiom could not release its map view', error)
    }
  }
}
