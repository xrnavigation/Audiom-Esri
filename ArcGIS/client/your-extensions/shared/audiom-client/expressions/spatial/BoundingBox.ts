/**
 * Vendor-neutral bounding box for spatial queries.
 *
 * Provides conversion to Esri envelope, OGC bbox parameter, and
 * Overpass bounding box filter formats.
 */

import type { EsriEnvelope } from './EsriSpatialFilter';

// ── BoundingBox type ────────────────────────────────────────────────

export interface BoundingBox {
  /** Western longitude (min x). */
  west: number;
  /** Southern latitude (min y). */
  south: number;
  /** Eastern longitude (max x). */
  east: number;
  /** Northern latitude (max y). */
  north: number;
}

/**
 * Create a bounding box from geographic coordinates.
 */
export function bbox(west: number, south: number, east: number, north: number): BoundingBox {
  return { west, south, east, north };
}

/**
 * Convert to OGC API Features `bbox` parameter format.
 * Format: `west,south,east,north`
 *
 * @see https://docs.ogc.org/is/17-069r4/17-069r4.html#_parameter_bbox
 */
export function toOgcBboxParam(box: BoundingBox): string {
  return `${box.west},${box.south},${box.east},${box.north}`;
}

/**
 * Convert to Overpass API bounding box filter format.
 * Format: `(south,west,north,east)` — note the different coordinate order.
 *
 * @see https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL#Global_bounding_box_(bbox)
 */
export function toOverpassBboxFilter(box: BoundingBox): string {
  return `(${box.south},${box.west},${box.north},${box.east})`;
}

/**
 * Convert to an Esri envelope geometry object.
 */
export function toEsriEnvelope(box: BoundingBox, wkid?: number): EsriEnvelope {
  const envelope: EsriEnvelope = {
    xmin: box.west,
    ymin: box.south,
    xmax: box.east,
    ymax: box.north,
  };
  if (wkid !== undefined) {
    envelope.spatialReference = { wkid };
  }
  return envelope;
}
