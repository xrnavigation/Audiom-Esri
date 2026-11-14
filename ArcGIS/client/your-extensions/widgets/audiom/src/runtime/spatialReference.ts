/** EPSG / Esri well-known ids this widget branches on. Do not widen a check by mixing these. */
export const Wkid = {
  /** CRS:84, the geographic code some floor queries report instead of 4326. */
  Crs84: 84,
  Wgs84: 4326,
  Nad83: 4269,
  WebMercator: 3857,
  WebMercatorAuxSphere: 102100,
  WebMercatorOld: 102113,
  /** Retired Google Spherical Mercator. Viewpoint JSON still uses it. */
  WebMercatorGoogle: 900913
} as const

/** Half the width of the Web Mercator world, in meters. */
export const WEB_MERCATOR_HALF_WORLD = 20037508.342789244

/**
 * Esri zoom-0 scale. zoom = log2(this / scale). Map Settings stores that
 * zoom as-is, one level above the Audiom/Mapbox equivalent.
 */
export const ESRI_ZOOM_0_SCALE = 591657527.591555

const WEB_MERCATOR_WKIDS = new Set<number>([
  Wkid.WebMercator,
  Wkid.WebMercatorAuxSphere,
  Wkid.WebMercatorOld
])

/** 3857 family used by drawn views and layer queries. Does not include 900913. */
export function isWebMercatorWkid (wkid?: number): boolean {
  return wkid != null && WEB_MERCATOR_WKIDS.has(wkid)
}

/** Viewpoint JSON may still carry the retired Google code. */
export function isWebMercatorViewpointWkid (wkid?: number): boolean {
  return isWebMercatorWkid(wkid) || wkid === Wkid.WebMercatorGoogle
}

export function webMercatorToLonLat (x: number, y: number): { longitude: number, latitude: number } {
  return {
    longitude: (x / WEB_MERCATOR_HALF_WORLD) * 180,
    latitude: (Math.atan(Math.exp((y / WEB_MERCATOR_HALF_WORLD) * Math.PI)) * 360) / Math.PI - 90
  }
}

/** Inverse of webMercatorToLonLat. Used when a view extent is already in meters. */
export function lonLatToWebMercator (longitude: number, latitude: number): { x: number, y: number } {
  return {
    x: longitude * WEB_MERCATOR_HALF_WORLD / 180,
    y: Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) * WEB_MERCATOR_HALF_WORLD / Math.PI
  }
}
