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
  x?: number
  y?: number
  screenPoint?: { x?: number, y?: number }
}

export interface MapHitGraphic {
  attributes?: Record<string, unknown> & { audiomAvatar?: boolean }
  layer?: {
    title?: string
    displayField?: string
    objectIdField?: string
    popupTemplate?: { title?: string }
    queryFeatures?: (query: unknown) => Promise<{ features?: Array<{ attributes?: Record<string, unknown> }> }>
  }
}

export interface MapViewHit {
  results?: Array<{ graphic?: MapHitGraphic }>
}

/** A map click that is not the avatar. Names are the layer under the pointer. */
export interface FeatureClickPoint {
  longitude: number
  latitude: number
  x?: number
  y?: number
  names?: string[]
  /** Clicked graphic's name, in Audiom's display-field order. */
  name?: string
  /** Clicked graphic's attributes, for the selected statistic value. */
  attributes?: Record<string, unknown>
}

export interface MapViewHandle {
  remove?: () => void
}

export interface MountedMapView {
  center?: unknown
  destroy?: () => void
  goTo?: (target: unknown) => Promise<unknown>
  toScreen?: (point: unknown) => { x?: number, y?: number } | null
  toMap?: (point: { x: number, y: number }) => { longitude?: number, latitude?: number } | null
  map?: {
    add?: (layer: unknown) => void
    remove?: (layer: unknown) => void
    layers?: { add?: (layer: unknown) => void, remove?: (layer: unknown) => void }
    allLayers?: {
      on?: (eventName: string, handler: () => void) => MapViewHandle
    }
    when?: () => Promise<unknown>
  }
  navigation?: { browserTouchPanEnabled?: boolean, mouseWheelZoomEnabled?: boolean }
  container?: HTMLElement
  ui?: {
    components?: string[]
  }
  /** Present on a MapView. Audiom turns this off; it does not render it. */
  popup?: {
    enabled?: boolean
    autoOpenEnabled?: boolean
    visible?: boolean
    close?: () => void
  }
  watch?: (property: string, handler: () => void) => MapViewHandle
  when?: () => Promise<unknown>
  /** Set by the embed. The widget forwards a non-avatar click here. */
  onFeatureClick?: (point: FeatureClickPoint | null) => void
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
  /** A map click that is not the avatar. Null closes Audiom's popup. */
  onFeatureClick?: (point: FeatureClickPoint | null) => void
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
    popupEnabled?: boolean
  }) => MountedMapSurface['view']
  Portal?: new (properties: { url: string }) => { url?: string }
  PortalItem?: new (properties: { id: string, portal: { url?: string } }) => { id: string, portal: { url?: string } }
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

/** The loader used by the map and by feature projection. */
export function loadMapModules (modules: string[]): Promise<unknown[]> {
  return moduleLoader(modules)
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
    ? ['esri/WebScene', 'esri/views/SceneView', 'esri/portal/Portal', 'esri/portal/PortalItem']
    : options.mapItemId
      ? ['esri/WebMap', 'esri/views/MapView', 'esri/portal/Portal', 'esri/portal/PortalItem']
      : ['esri/Map', 'esri/views/MapView']
  const loaded = await moduleLoader(modules)
  // loadArcGISJSAPIModules resolves bare constructors in request order, not
  // objects keyed by name. Index the array; do not read a `.Map` property.
  const MapCtor = loaded[0] as MapModules['Map'] | undefined
  const ViewCtor = loaded[1] as MapModules['MapView'] | undefined
  if (!MapCtor || !ViewCtor) throw new Error('Esri map modules did not load')
  const ownedMap = !options.existingMap
  const portalItem = options.mapItemId
    ? await portalItemFor(loaded, options.mapItemId, options.portalUrl)
    : undefined
  console.error('Audiom map item', options.mapItemId || '', options.portalUrl || '')
  const map = options.existingMap || (portalItem
    ? new MapCtor({ portalItem })
    : new MapCtor({ basemap: 'streets-vector' }))
  const view = new ViewCtor({
    container: options.container,
    map,
    center: [options.longitude ?? 0, options.latitude ?? 0],
    zoom: options.zoom ?? 2,
    popupEnabled: false
  })
  // Hiding Esri's +/- must not abort the map. Audiom still mounts if this throws.
  try {
    hideNativeZoom(view)
  } catch (error) {
    console.error('Audiom could not hide Esri zoom', error)
  }
  // The constructor flag is not enough if a later owner turns the popup back
  // on. Audiom's content replaces it either way.
  try {
    disableNativePopup(view)
  } catch (error) {
    console.error('Audiom could not disable the Esri popup', error)
  }
  const surface: MountedMapSurface = { view, ownedMap }
  await attachAvatarLayer(surface)
  disableArrowKeyMapPan(surface)
  attachIndicatorClick(surface)
  return surface
}

/**
 * A plain `{ url }` is not an Esri Portal. Without a Portal instance the
 * item request uses the Experience Builder app portal and fails CONT_0001.
 */
async function portalItemFor (
  loaded: unknown[],
  itemId: string,
  portalUrl: string | undefined
): Promise<{ id: string, portal?: { url?: string } }> {
  const Portal = loaded[2] as MapModules['Portal']
  const PortalItem = loaded[3] as MapModules['PortalItem']
  if (!portalUrl || !Portal || !PortalItem) return { id: itemId }
  const portal = new Portal({ url: portalUrl })
  if (typeof (portal as { load?: () => Promise<unknown> }).load === 'function') {
    await (portal as { load: () => Promise<unknown> }).load()
  }
  return new PortalItem({ id: itemId, portal })
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

/** Esri adds zoom by default. Audiom already has zoom controls. */
export function hideNativeZoom (view: MountedMapView): void {
  const ui = view.ui
  if (ui) {
    // Setting components is how Experience Builder drops default widgets.
    // remove() is not used: a missing component throws and aborts the map.
    ui.components = (ui.components ?? ['attribution', 'zoom', 'navigation-toggle'])
      .filter((name) => name !== 'zoom' && name !== 'navigation-toggle')
  }
  const root = view.container
  if (!root?.appendChild) return
  const styleId = 'audiom-hide-esri-zoom'
  if (root.querySelector?.(`#${styleId}`)) return
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = '.esri-zoom, .esri-navigation-toggle { display: none !important; }'
  root.appendChild(style)
}

/**
 * Audiom owns feature content on this view. The Esri popup stays off so a
 * click cannot open a second, field-based popup Audiom cannot announce or
 * style. A missing popup API must not abort the map.
 */
export function disableNativePopup (view: MountedMapView): void {
  const popup = view.popup
  if (!popup) return
  try {
    popup.autoOpenEnabled = false
    popup.enabled = false
    if (popup.visible) popup.close?.()
  } catch {
    // Already closed, or this view has no popup widget.
  }
}

/** Arrow keys move the Audiom avatar, not the map camera. */
export function disableArrowKeyMapPan (surface: MountedMapSurface): void {
  const view = surface.view
  surface.keyHandle = view.on?.('key-down', (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.stopPropagation?.()
    }
  })
}

const LAYER_NAME_FIELDS = ['name', 'Name', 'NAME', 'title', 'Title', 'TITLE', 'label', 'Label', 'LABEL']

/**
 * The name Audiom would show for one hit graphic. Same fields as the
 * snapshot label: the layer display field, then name, title, and label.
 * An object id is not a name.
 */
export function hitFeatureName (graphic: MapHitGraphic | null | undefined): string | null {
  if (!graphic || graphic.attributes?.audiomAvatar) return null
  const attributes = graphic.attributes || {}
  const displayField = graphic.layer?.displayField
  const fields = displayField ? [displayField, ...LAYER_NAME_FIELDS] : LAYER_NAME_FIELDS
  for (const field of fields) {
    const value = attributes[field]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && field !== graphic.layer?.objectIdField) return String(value)
  }
  // A drawn layer with no name field still has a title. An object id is not a name.
  const title = graphic.layer?.title
  return title && title.trim() ? title.trim() : null
}

/** Names of the layer features under a click, skipping the avatar marker. */
export function hitFeatureNames (hit: MapViewHit | null | undefined): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const result of hit?.results || []) {
    const name = hitFeatureName(result.graphic)
    if (!name || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

/** The clicked graphic's name and attributes: the topmost non-avatar hit. */
export function hitFeatureData (hit: MapViewHit | null | undefined): { name: string | null, attributes: Record<string, unknown> | null } {
  for (const result of hit?.results || []) {
    const graphic = result.graphic
    if (!graphic || graphic.attributes?.audiomAvatar) continue
    return { name: graphicName(graphic), attributes: graphic.attributes ?? null }
  }
  return { name: null, attributes: null }
}

/**
 * The plot's own name from its attributes: a {field} popup title, then the
 * display/name fields, then owner/name-like string columns in priority order,
 * then any string column. The layer title is never used — that names the layer.
 */
export function graphicName (graphic: MapHitGraphic | null | undefined): string | null {
  if (!graphic) return null
  const title = resolvePopupTitle(graphic)
  if (title) return title
  const attributes = graphic.attributes || {}
  const layer = graphic.layer
  const direct = [layer?.displayField, 'name', 'Name', 'NAME', 'title', 'Title', 'TITLE', 'label', 'Label', 'LABEL']
  for (const field of direct) {
    if (!field) continue
    const value = attributes[field]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  const exclude = new Set([layer?.objectIdField, 'OBJECTID', 'FID', 'OID', 'GlobalID', 'GLOBALID'].filter(Boolean) as string[])
  const keys = Object.keys(attributes)
  const stringKey = (pattern: RegExp): string | undefined =>
    keys.find((key) => !exclude.has(key) && pattern.test(key) &&
      typeof attributes[key] === 'string' && (attributes[key] as string).trim())
  // Owner and name first, address last: the plot's label, not a street.
  const ordered = [/owner/i, /name/i, /label|title/i, /parcel|plot|site|place/i, /tract|block|geoid|zone|ward|district|county|city|town|region|watershed|huc|unit/i, /addr/i]
  for (const pattern of ordered) {
    const key = stringKey(pattern)
    if (key) return String(attributes[key]).trim()
  }
  const firstString = keys.find((key) =>
    !exclude.has(key) && typeof attributes[key] === 'string' &&
    (attributes[key] as string).trim() && !/^(fill|stroke|audiom)/i.test(key)
  )
  if (firstString) return String(attributes[firstString]).trim()
  return null
}

/**
 * The layer popup title with {field} placeholders filled from the graphic.
 * This is the plot name the native Esri popup showed. A static title names the
 * layer, and an Arcade title leaves braces; both are rejected.
 */
export function resolvePopupTitle (graphic: MapHitGraphic | null | undefined): string | null {
  const title = graphic?.layer?.popupTemplate?.title
  if (typeof title !== 'string' || !graphic) return null
  if (!title.includes('{')) return null
  const attributes = graphic.attributes || {}
  const resolved = title.replace(/\{([^}]+)\}/g, (_match, token) => {
    const value = attributes[String(token).trim()]
    return value == null ? '' : String(value)
  }).trim()
  if (!resolved || resolved.includes('{')) return null
  return resolved
}

/**
 * Full attributes for the clicked graphic. A choropleth layer often fetches
 * only the rendered statistic, so the name column needs a query by object id.
 */
export async function featureDetails (graphic: MapHitGraphic | null | undefined): Promise<{ name: string | null, attributes: Record<string, unknown> | null }> {
  if (!graphic) return { name: null, attributes: null }
  let attributes = graphic.attributes ?? null
  const layer = graphic.layer
  const oidField = layer?.objectIdField
  const oid = oidField && attributes ? attributes[oidField] : undefined
  if (typeof layer?.queryFeatures === 'function' && oid != null) {
    try {
      const result = await layer.queryFeatures({ objectIds: [oid], outFields: ['*'], returnGeometry: false })
      const queried = result?.features?.[0]?.attributes
      if (queried) attributes = queried
    } catch {
      // Keep the hit-test attributes when the layer does not allow a query.
    }
  }
  return { name: graphicName({ ...graphic, attributes: attributes ?? undefined }), attributes }
}

/** Clicking Audiom's indicator selects it. Any other click opens Audiom content. */
function attachIndicatorClick (surface: MountedMapSurface): void {
  const view = surface.view
  surface.clickHandle = view.on?.('click', (event) => {
    const point = event.mapPoint
    const graphic = surface.avatar as { geometry?: { longitude?: number, latitude?: number }, attributes?: { audiomAvatar?: boolean } } | undefined
    const near = point && graphic?.attributes?.audiomAvatar && graphic.geometry &&
      Math.abs((point.longitude ?? 0) - (graphic.geometry.longitude ?? 0)) < 0.02 &&
      Math.abs((point.latitude ?? 0) - (graphic.geometry.latitude ?? 0)) < 0.02
    // The DOM onClick opens the feature popup with full attributes. Here we
    // only select the avatar and keep the native Esri popup from opening.
    const finish = (avatarHit: boolean) => {
      if (avatarHit) {
        surface.onIndicatorClick?.()
        return
      }
      event.stopPropagation?.()
      disableNativePopup(view)
    }
    if (!view.hitTest) {
      finish(Boolean(near))
      return
    }
    void view.hitTest(event).then((hit) => {
      const selected = hit.results?.some((result) => result.graphic?.attributes?.audiomAvatar)
      finish(Boolean(selected || near))
    }).catch(() => {
      finish(Boolean(near))
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
  // that node, so shift into the overlay's box. Do not look up #audiom-embed
  // here: that node is a different size, and using it ties the compass to zoom.
  const viewNode = surface.view.container
  const overlay = viewNode?.parentElement
  if (!viewNode || !overlay) return { x: projected.x, y: projected.y }
  const viewBox = viewNode.getBoundingClientRect()
  const overlayBox = overlay.getBoundingClientRect()
  // Pin the indicator to the map edge rather than unmounting it off-screen.
  // Removing the node drops keyboard focus, which is what stopped navigation
  // at the corners once the avatar projected outside the view.
  const margin = 26
  const clamp = (value: number, size: number): number =>
    Math.min(Math.max(value, margin), Math.max(margin, size - margin))
  const x = clamp(projected.x, viewBox.width) + viewBox.left - overlayBox.left
  const y = clamp(projected.y, viewBox.height) + viewBox.top - overlayBox.top
  return { x, y }
}

/** Screen position of a geographic point in the compass overlay box, no clamp. */
export async function featureScreenPoint (
  surface: MountedMapSurface | null,
  longitude: number,
  latitude: number
): Promise<{ x: number, y: number } | null> {
  if (!surface || !surface.view.toScreen) return null
  const [, Point] = await moduleLoader([
    'esri/Graphic',
    'esri/geometry/Point'
  ]) as [AvatarModules['Graphic'], AvatarModules['Point']]
  const projected = surface.view.toScreen(new Point({ longitude, latitude }))
  if (projected?.x == null || projected.y == null) return null
  const viewNode = surface.view.container
  const overlay = viewNode?.parentElement
  if (!viewNode || !overlay) return { x: projected.x, y: projected.y }
  const viewBox = viewNode.getBoundingClientRect()
  const overlayBox = overlay.getBoundingClientRect()
  return {
    x: projected.x + viewBox.left - overlayBox.left,
    y: projected.y + viewBox.top - overlayBox.top
  }
}

/**
 * Geographic point under a screen position in the compass overlay.
 * The overlay is a sibling of the view, so the point is shifted into the
 * view before Esri converts it. Null when the view cannot project it.
 */
export function mapPointFromScreen (
  surface: MountedMapSurface | null,
  screen: { x: number, y: number }
): { longitude: number, latitude: number } | null {
  const view = surface?.view
  if (!view?.toMap) return null
  const viewNode = view.container
  const overlay = viewNode?.parentElement
  const viewBox = viewNode?.getBoundingClientRect?.()
  const overlayBox = overlay?.getBoundingClientRect?.()
  const x = viewBox && overlayBox
    ? screen.x - (viewBox.left - overlayBox.left)
    : screen.x
  const y = viewBox && overlayBox
    ? screen.y - (viewBox.top - overlayBox.top)
    : screen.y
  const mapped = view.toMap({ x, y })
  if (mapped?.longitude == null || mapped.latitude == null) return null
  if (!Number.isFinite(mapped.longitude) || !Number.isFinite(mapped.latitude)) return null
  return { longitude: mapped.longitude, latitude: mapped.latitude }
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
