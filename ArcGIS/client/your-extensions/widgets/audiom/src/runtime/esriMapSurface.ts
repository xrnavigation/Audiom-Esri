import { loadArcGISJSAPIModules } from 'jimu-core'

export interface MapSurfaceOptions {
  container: HTMLElement
  existingMap?: unknown
  longitude?: number
  latitude?: number
  zoom?: number
}

export interface MountedMapSurface {
  view: { center?: unknown, destroy?: () => void, map?: unknown }
  ownedMap: boolean
}

export interface MapModules {
  Map: new (properties: { basemap?: string }) => unknown
  MapView: new (properties: {
    container: HTMLElement
    map: unknown
    center?: [number, number]
    zoom?: number
  }) => MountedMapSurface['view']
}

type ModuleLoader = (modules: string[]) => Promise<MapModules[]>

let moduleLoader: ModuleLoader = async (modules) => {
  const loaded = await loadArcGISJSAPIModules(modules)
  return loaded as MapModules[]
}

/** Tests replace the ArcGIS loader so jsdom never constructs a WebGL view. */
export function setMapModuleLoader (loader: ModuleLoader | null): void {
  moduleLoader = loader || (async (modules) => {
    const loaded = await loadArcGISJSAPIModules(modules)
    return loaded as MapModules[]
  })
}

/**
 * Draws an Esri MapView in the widget. Reuses the selected map's layers
 * when one exists; otherwise creates a 2D map in this container.
 */
export async function mountEsriMap (options: MapSurfaceOptions): Promise<MountedMapSurface> {
  const [Map, MapView] = await moduleLoader(['esri/Map', 'esri/views/MapView'])
  const ownedMap = !options.existingMap
  const map = options.existingMap || new Map({ basemap: 'streets-vector' })
  const view = new MapView({
    container: options.container,
    map,
    center: [options.longitude ?? 0, options.latitude ?? 0],
    zoom: options.zoom ?? 2
  })
  return { view, ownedMap }
}

export function moveMapCenter (
  surface: MountedMapSurface | null,
  longitude: number,
  latitude: number
): void {
  if (!surface) return
  surface.view.center = { longitude, latitude }
}

export function destroyMapSurface (surface: MountedMapSurface | null): void {
  surface?.view.destroy?.()
}
