import {
  esri,
  getAppStore,
  portalUrlUtils,
  SessionManager,
  type IMDataSourceJson
} from 'jimu-core'
import type { MapSyncConfig } from '../utils/mapSyncManager'
import { createLogger } from '../utils/logger'

const logger = createLogger('BundledViewpoint')

type ExtentGeometry = {
  xmin?: number
  ymin?: number
  xmax?: number
  ymax?: number
  x?: number
  y?: number
  latitude?: number
  longitude?: number
  spatialReference?: { wkid?: number, latestWkid?: number }
}

type ItemLayer = {
  id?: string
  title?: string
  url?: string
  layerType?: string
  visibility?: boolean
  layers?: ItemLayer[]
}

type PortalItemMeta = {
  error?: unknown
  title?: string
  extent?: [[number, number], [number, number]] | ExtentGeometry
}

type WebMapData = {
  error?: unknown
  initialState?: { viewpoint?: { targetGeometry?: ExtentGeometry, scale?: number } }
  operationalLayers?: Array<{ id?: string, title?: string, url?: string, visibility?: boolean }>
}

const WEB_MERCATOR = 20037508.342789244

/** The drawn map in the canvas iframe. Experience Builder names that frame `_appWindow`. */
export function canvasMapViewpoint (): MapSyncConfig | null {
  try {
    const frame = document.getElementById('_appWindow') as HTMLIFrameElement | null
    const frameWindow = frame?.contentWindow as (Window & { document?: Document }) | null
    const node = frameWindow?.document?.getElementById('audiom-esri-map') as {
      __audiomSurface?: { view?: { center?: { latitude?: number, longitude?: number }, zoom?: number } }
    } | null
    const view = node?.__audiomSurface?.view
    const latitude = view?.center?.latitude
    const longitude = view?.center?.longitude
    const zoom = view?.zoom
    if (latitude == null || longitude == null || zoom == null) return null
    return {
      centerLatitude: latitude,
      centerLongitude: longitude,
      zoom
    }
  } catch {
    return null
  }
}

function dataSources (): Record<string, IMDataSourceJson | null | undefined> {
  const state = getAppStore().getState() as {
    appConfig?: { dataSources?: Record<string, IMDataSourceJson | null | undefined> }
    appStateInBuilder?: { appConfig?: { dataSources?: Record<string, IMDataSourceJson | null | undefined> } }
  }
  return {
    ...(state.appConfig?.dataSources || {}),
    ...(state.appStateInBuilder?.appConfig?.dataSources || {})
  }
}

/** The portal that owns this item. A missing URL is the CONT_0001 failure. */
export function portalUrlForItem (itemId: string): string | undefined {
  for (const source of Object.values(dataSources())) {
    if (source?.itemId === itemId && source.portalUrl) return source.portalUrl
  }
  return undefined
}

/** The portal of the source the selector just connected. */
export function portalUrlForSource (dataSourceId: string): string | undefined {
  if (!dataSourceId) return undefined
  return dataSources()[dataSourceId]?.portalUrl || undefined
}

/** Center, zoom, and layers of the web map the user just selected.
 * This runs in the settings window, which is the window that owns the
 * Map Settings fields. */
export async function readBundledMapViewpoint (itemId: string, portalUrl?: string): Promise<MapSyncConfig | null> {
  if (!itemId) {
    logger.warn('no item id, cannot read a viewpoint')
    return null
  }
  const url = portalUrl || portalUrlForItem(itemId) || appPortalUrl()
  logger.debug('reading viewpoint for', itemId, 'from portal', url)

  // A shared item answers an unauthenticated REST read. A private item
  // returns 403, and that path must fall through to the signed-in session.
  const fromRest = await readViaRest(itemId, url).catch((error) => {
    logger.warn('REST read failed for', itemId, error)
    return null
  })
  if (fromRest) {
    logger.debug('viewpoint from REST', fromRest)
    return fromRest
  }

  const fromSession = await readViaSession(itemId, url).catch((error) => {
    logger.warn('signed-in portal read failed for', itemId, error)
    return null
  })
  if (fromSession) {
    logger.debug('viewpoint from signed-in session', fromSession)
    return fromSession
  }

  logger.warn('could not read a center for', itemId, '- Map Settings left unchanged')
  return null
}

/** The portal the builder is signed in to, when the data source has none yet. */
function appPortalUrl (): string | undefined {
  const state = getAppStore().getState() as { portalUrl?: string }
  return state.portalUrl || undefined
}

/** Read item metadata and web map data over REST. The item extent is WGS84. */
async function readViaRest (itemId: string, portalUrl?: string): Promise<MapSyncConfig | null> {
  const base = normalizePortalRest(portalUrl)
  if (!base) return null
  const meta = await fetchJson<PortalItemMeta>(`${base}/content/items/${itemId}?f=json`)
  if (!meta || meta.error) return null
  const center = centerFromItemExtent(meta.extent)
  if (!center) return null
  let zoom: number | undefined
  let sourceConfigs: MapSyncConfig['sourceConfigs']
  const data = await fetchJson<WebMapData>(`${base}/content/items/${itemId}/data?f=json`).catch(() => null)
  if (data && !data.error) {
    const viewpoint = data.initialState?.viewpoint
    zoom = zoomOf(viewpoint?.scale, viewpoint?.targetGeometry, meta.extent)
    sourceConfigs = sourcesFromLayers(data.operationalLayers)
  }
  return {
    title: meta.title,
    centerLatitude: center.latitude,
    centerLongitude: center.longitude,
    zoom,
    sourceConfigs
  }
}

/**
 * Read a private item with the builder's signed-in session. A bare Portal
 * instance does not carry that credential, so item.load() gets the same 403
 * the unauthenticated REST read got.
 */
async function readViaSession (itemId: string, portalUrl?: string): Promise<MapSyncConfig | null> {
  const restUrl = normalizePortalRest(portalUrl)
  if (!restUrl) return null
  const authentication = SessionManager.getInstance().getSessionByUrl(portalUrl || restUrl)
    || SessionManager.getInstance().getMainSession()
  if (!authentication) {
    logger.warn('no signed-in session for', portalUrl, '- private item cannot be read')
    return null
  }
  const meta = await esri.restPortal.getItem(itemId, { portal: restUrl, authentication })
  const data = await esri.restPortal.getItemData(itemId, { portal: restUrl, authentication }) as WebMapData
  if (!meta || meta.error || !data || data.error) return null
  const viewpoint = data.initialState?.viewpoint
  const center = geographicCenter(viewpoint?.targetGeometry) || centerFromItemExtent(meta.extent)
  if (!center) return null
  const sourceConfigs = sourcesFromLayers(data.operationalLayers)
  const zoom = zoomOf(viewpoint?.scale, viewpoint?.targetGeometry, meta.extent)
  logger.debug('signed-in item read', {
    itemId,
    portal: restUrl,
    title: meta.title,
    zoom,
    sources: sourceConfigs?.length || 0
  })
  return {
    title: meta.title,
    centerLatitude: center.latitude,
    centerLongitude: center.longitude,
    zoom,
    sourceConfigs
  }
}

async function fetchJson<T> (url: string): Promise<T | null> {
  const res = await fetch(url)
  if (!res.ok) return null
  return res.json() as Promise<T>
}

/** Source Configurations list feature services only. Image and map
 * services are drawn by the web map; they are not Audiom sources. */
function isFeatureServer (layer: ItemLayer): boolean {
  const url = layer.url || ''
  if (/\/ImageServer(?:\/|$)/i.test(url)) return false
  if (/\/MapServer(?:\/|$)/i.test(url)) return false
  if (/\/FeatureServer(?:\/|$)/i.test(url)) return true
  const kind = layer.layerType || ''
  if (/ImageService|MapService/i.test(kind)) return false
  return /Feature/i.test(kind)
}

function sourcesFromLayers (layers?: ItemLayer[]): MapSyncConfig['sourceConfigs'] {
  const configs: NonNullable<MapSyncConfig['sourceConfigs']> = []
  const walk = (nodes: ItemLayer[] | undefined, parentVisible: boolean) => {
    for (const layer of nodes || []) {
      const visible = parentVisible && layer.visibility !== false
      // Group layers have no url of their own. Their children do.
      if (layer.url && isFeatureServer(layer)) {
        configs.push({
          name: layer.title,
          source: layer.id,
          sourceUrl: layer.url,
          enabled: visible
        })
      }
      if (layer.layers?.length) walk(layer.layers, visible)
    }
  }
  walk(layers, true)
  return configs.length > 0 ? configs : undefined
}

/** Prefer the item scale. A web map with no scale still has an extent, and
 * leaving zoom undefined keeps the settings field at its default. */
function zoomOf (
  scale: number | undefined,
  geometry: ExtentGeometry | null | undefined,
  extent: PortalItemMeta['extent']
): number | undefined {
  if (scale) return zoomFromScale(scale)
  const width = extentWidthDegrees(geometry) ?? extentWidthDegrees(extent)
  if (width == null || width <= 0) return undefined
  const derivedScale = (width / 360) * 591657527.591555
  return zoomFromScale(derivedScale)
}

function extentWidthDegrees (
  extent: ExtentGeometry | [[number, number], [number, number]] | null | undefined
): number | undefined {
  if (!extent) return undefined
  if (Array.isArray(extent)) {
    const west = extent[0]?.[0]
    const east = extent[1]?.[0]
    if (west == null || east == null) return undefined
    return Math.abs(east - west)
  }
  if (extent.xmin == null || extent.xmax == null) return undefined
  const west = geographicCenter({ ...extent, xmax: extent.xmin, ymax: extent.ymin })
  const east = geographicCenter({ ...extent, xmin: extent.xmax, ymin: extent.ymax })
  if (!west || !east) return undefined
  return Math.abs(east.longitude - west.longitude)
}

/** A data source portal URL may or may not include the sharing/rest suffix. */
function normalizePortalRest (portalUrl?: string): string | null {
  if (!portalUrl) return null
  const trimmed = portalUrl.replace(/\/+$/, '')
  // Already a REST root. Do not ask the helper to append the suffix again.
  if (/\/sharing\/rest$/i.test(trimmed)) return trimmed
  try {
    const rest = portalUrlUtils.getPortalRestUrl(portalUrl)
    if (rest && !/\/sharing\/rest\/sharing\/rest/i.test(rest)) return rest.replace(/\/+$/, '')
  } catch {
    // Fall through to the local suffix.
  }
  return `${trimmed.replace(/\/sharing$/i, '')}/sharing/rest`
}

/** Portal item extent is already WGS84. Do not project it. */
export function centerFromItemExtent (
  extent: ExtentGeometry | [[number, number], [number, number]] | null | undefined
): { latitude: number, longitude: number } | null {
  if (!extent) return null
  if (Array.isArray(extent)) {
    const west = extent[0]?.[0]
    const south = extent[0]?.[1]
    const east = extent[1]?.[0]
    const north = extent[1]?.[1]
    if (west == null || south == null || east == null || north == null) return null
    return { longitude: (west + east) / 2, latitude: (south + north) / 2 }
  }
  return geographicCenter(extent)
}

/** A viewpoint target is often an extent in Web Mercator, not a lat/lon. */
export function geographicCenter (geometry: ExtentGeometry | null | undefined): { latitude: number, longitude: number } | null {
  if (!geometry) return null
  if (isGeographic(geometry) && geometry.latitude != null && geometry.longitude != null) {
    return { latitude: geometry.latitude, longitude: geometry.longitude }
  }
  const x = midpoint(geometry.xmin, geometry.xmax, geometry.x ?? geometry.longitude)
  const y = midpoint(geometry.ymin, geometry.ymax, geometry.y ?? geometry.latitude)
  if (x == null || y == null) return null
  if (isWebMercator(geometry) || Math.abs(x) > 180 || Math.abs(y) > 90) {
    return webMercatorToGeographic(x, y)
  }
  return { longitude: x, latitude: y }
}

function midpoint (min: number | undefined, max: number | undefined, point: number | undefined): number | undefined {
  if (min != null && max != null) return (min + max) / 2
  return point
}

function isGeographic (geometry: ExtentGeometry): boolean {
  const wkid = geometry.spatialReference?.latestWkid || geometry.spatialReference?.wkid
  return wkid === 4326 || wkid === 4269
}

function isWebMercator (geometry: ExtentGeometry): boolean {
  const wkid = geometry.spatialReference?.latestWkid || geometry.spatialReference?.wkid
  return wkid === 102100 || wkid === 3857 || wkid === 102113 || wkid === 900913
}

function webMercatorToGeographic (x: number, y: number): { latitude: number, longitude: number } {
  const longitude = (x / WEB_MERCATOR) * 180
  const latitude = (Math.atan(Math.exp((y / WEB_MERCATOR) * Math.PI)) * 360 / Math.PI) - 90
  return { latitude, longitude }
}

/** Esri scale to the Esri view zoom. Map Settings stores that zoom as-is. */
function zoomFromScale (scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 0
  const esriZoom = Math.log2(591657527.591555 / scale)
  return Math.max(Math.round(esriZoom), 0)
}
