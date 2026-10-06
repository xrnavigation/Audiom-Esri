import { loadArcGISJSAPIModules } from 'jimu-core'
import type { ReportedAvatar } from './reportedAvatar'

export interface MapSurfaceOptions {
  container: HTMLElement
  existingMap?: unknown
  longitude?: number
  latitude?: number
  zoom?: number
  /** Portal item drawn by this widget. Bundled mode never borrows a Map widget. */
  mapItemId?: string
  portalUrl?: string
  scene?: boolean
}

export interface AvatarGraphicsLayer {
  removeAll?: () => void
  remove?: (graphic: unknown) => void
  add?: (graphic: unknown) => void
  destroy?: () => void
}

export interface MapViewEvent {
  key?: string
  stopPropagation?: () => void
  mapPoint?: { longitude?: number, latitude?: number }
}

export interface MapViewHit {
  results?: Array<{ graphic?: { attributes?: { audiomAvatar?: boolean } } }>
}

export interface MapViewHandle {
  remove?: () => void
}

export interface MountedMapView {
  center?: unknown
  destroy?: () => void
  goTo?: (target: unknown) => Promise<unknown>
  toScreen?: (point: unknown) => { x?: number, y?: number } | null
  map?: {
    add?: (layer: unknown) => void
    remove?: (layer: unknown) => void
    layers?: { add?: (layer: unknown) => void, remove?: (layer: unknown) => void }
  }
  navigation?: { browserTouchPanEnabled?: boolean, mouseWheelZoomEnabled?: boolean }
  container?: HTMLElement
  ui?: { components?: string[] }
  watch?: (property: string, handler: () => void) => MapViewHandle
  when?: () => Promise<unknown>
  on?: (eventName: string, handler: (event: MapViewEvent) => void) => MapViewHandle
  hitTest?: (event: unknown) => Promise<MapViewHit>
  graphics?: { remove?: (graphic: unknown) => void, add?: (graphic: unknown) => void }
}

export interface MountedMapSurface {
  view: MountedMapView
  ownedMap: boolean
  avatarLayer?: AvatarGraphicsLayer
  avatar?: unknown
  keyHandle?: MapViewHandle
  clickHandle?: MapViewHandle
  onIndicatorClick?: () => void
}

export interface MapModules {
  Map: new (properties: {
    basemap?: string
    portalItem?: { id: string, portal?: { url: string } }
  }) => unknown
  MapView: new (properties: {
    container: HTMLElement
    map: unknown
    center?: [number, number]
    zoom?: number
  }) => MountedMapSurface['view']
}
export interface AvatarModules {
  Graphic: new (properties: unknown) => unknown
  Point: new (properties: unknown) => unknown
  GraphicsLayer: new (properties?: unknown) => AvatarGraphicsLayer
}

type ModuleLoader = (modules: string[]) => Promise<unknown[]>

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
 * Draws an Esri view in the widget. A portal item becomes this widget's
 * own web map or web scene. An existing map is reused only when one is
 * already owned here. Otherwise a 2D streets map is created in this container.
 */
export async function mountEsriMap (options: MapSurfaceOptions): Promise<MountedMapSurface> {
  const scene = Boolean(options.scene && options.mapItemId)
  const modules = scene
    ? ['esri/WebScene', 'esri/views/SceneView']
    : options.mapItemId
      ? ['esri/WebMap', 'esri/views/MapView']
      : ['esri/Map', 'esri/views/MapView']
  const loaded = await moduleLoader(modules) as MapModules[]
  const MapCtor = loaded[0]?.Map
  const ViewCtor = loaded[1]?.MapView
  if (!MapCtor || !ViewCtor) throw new Error('Esri map modules did not load')
  const ownedMap = !options.existingMap
  const map = options.existingMap || (options.mapItemId
    ? new MapCtor({
      portalItem: {
        id: options.mapItemId,
        portal: options.portalUrl ? { url: options.portalUrl } : undefined
      }
    })
    : new MapCtor({ basemap: 'streets-vector' }))
  const view = new ViewCtor({
    container: options.container,
    map,
    center: [options.longitude ?? 0, options.latitude ?? 0],
    zoom: options.zoom ?? 2
  })
  const surface: MountedMapSurface = { view, ownedMap }
  await attachAvatarLayer(surface)
  disableArrowKeyMapPan(surface)
  attachIndicatorClick(surface)
  return surface
}

/** Audiom's marker lives on its own layer. Shared view graphics are never cleared. */
async function attachAvatarLayer (surface: MountedMapSurface): Promise<void> {
  const loaded = await moduleLoader(['esri/layers/GraphicsLayer'])
  const GraphicsLayer = loaded[0] as AvatarModules['GraphicsLayer'] | undefined
  if (!GraphicsLayer) return
  const layer = new GraphicsLayer({ id: 'audiom-avatar', listMode: 'hide', title: 'Audiom avatar' })
  const map = surface.view.map
  if (map?.layers?.add) map.layers.add(layer)
  else if (map?.add) map.add(layer)
  else return
  surface.avatarLayer = layer
}

/** Arrow keys move the Audiom avatar, not the map camera. */
export function disableArrowKeyMapPan (surface: MountedMapSurface): void {
  const view = surface.view as {
    navigation?: { browserTouchPanEnabled?: boolean }
    on?: MountedMapSurface['view']['on']
  } & Record<string, unknown>
  const keys = view.navigation as { browserTouchPanEnabled?: boolean } & Record<string, unknown> | undefined
  if (keys) {
    keys.browserTouchPanEnabled = false
    for (const name of ['keyboardPanEnabled', 'keyboardZoomEnabled', 'gamepadEnabled']) {
      if (name in keys || keys[name] !== false) keys[name] = false
    }
  }
  surface.keyHandle = view.on?.('key-down', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.stopPropagation?.()
    }
  })
}

/** Clicking Audiom's indicator selects it, the same as clicking Audiom's marker. */
function attachIndicatorClick (surface: MountedMapSurface): void {
  const view = surface.view
  surface.clickHandle = view.on?.('click', (event) => {
    const point = event.mapPoint
    const graphic = surface.avatar as { geometry?: { longitude?: number, latitude?: number }, attributes?: { audiomAvatar?: boolean } } | undefined
    const near = point && graphic?.attributes?.audiomAvatar && graphic.geometry &&
      Math.abs((point.longitude ?? 0) - (graphic.geometry.longitude ?? 0)) < 0.02 &&
      Math.abs((point.latitude ?? 0) - (graphic.geometry.latitude ?? 0)) < 0.02
    if (!view.hitTest) {
      if (near) surface.onIndicatorClick?.()
      return
    }
    void view.hitTest(event).then((hit) => {
      const selected = hit.results?.some((result) => result.graphic?.attributes?.audiomAvatar)
      if (selected || near) surface.onIndicatorClick?.()
    }).catch(() => {
      if (near) surface.onIndicatorClick?.()
    })
  })
}

/**
 * Records the position Audiom reported. The visible indicator is the DOM
 * compass. A second graphic would draw a duplicate icon.
 */
export async function showAvatar (
  surface: MountedMapSurface | null,
  position: ReportedAvatar | null
): Promise<void> {
  if (!surface || !position) return
  surface.avatar = {
    geometry: {
      longitude: position.longitude,
      latitude: position.latitude
    },
    attributes: { audiomAvatar: true, heading: position.heading }
  }
}

/** Screen position of a reported avatar, or null when the view cannot project it. */
export async function avatarScreenPoint (
  surface: MountedMapSurface | null,
  position: ReportedAvatar | null
): Promise<{ x: number, y: number } | null> {
  if (!surface || !position || !surface.view.toScreen) return null
  const [, Point] = await moduleLoader([
    'esri/Graphic',
    'esri/geometry/Point'
  ]) as [AvatarModules['Graphic'], AvatarModules['Point']]
  const projected = surface.view.toScreen(new Point({
    longitude: position.longitude,
    latitude: position.latitude
  }))
  if (projected?.x == null || projected.y == null) return null
  // toScreen is relative to the view container. The compass is a sibling of
  // that node, so shift into the overlay's box. A point outside the view is
  // not drawn: that is what made the indicator vanish off the map.
  const viewNode = surface.view.container
  const overlay = viewNode?.parentElement
  if (!viewNode || !overlay) return { x: projected.x, y: projected.y }
  const viewBox = viewNode.getBoundingClientRect()
  const overlayBox = overlay.getBoundingClientRect()
  const x = projected.x + viewBox.left - overlayBox.left
  const y = projected.y + viewBox.top - overlayBox.top
  if (projected.x < 0 || projected.y < 0 || projected.x > viewBox.width || projected.y > viewBox.height) {
    return null
  }
  return { x, y }
}

export function destroyMapSurface (surface: MountedMapSurface | null): void {
  surface?.keyHandle?.remove?.()
  surface?.clickHandle?.remove?.()
  const layer = surface?.avatarLayer
  const map = surface?.view.map
  if (layer) {
    layer.removeAll?.()
    if (map?.layers?.remove) map.layers.remove(layer)
    else map?.remove?.(layer)
    layer.destroy?.()
  }
  surface?.view.destroy?.()
}
