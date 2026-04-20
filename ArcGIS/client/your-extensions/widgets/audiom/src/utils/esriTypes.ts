// ============================================================================
// ESRI Map Type Extensions
// ============================================================================
// These interfaces extend ESRI's base types to include runtime properties
// that exist but may not be included in the TypeScript definitions.

/**
 * Portal item metadata attached to maps loaded from ArcGIS Online/Portal.
 * Only fields actually consumed are declared here.
 */
export interface EsriPortalItem {
  readonly title?: string;
}

/**
 * Extended map interface that includes portal item metadata.
 * ESRI maps loaded from Portal have a portalItem property at runtime,
 * but this may not be in all TypeScript definitions.
 */
export interface EsriMapWithPortalItem {
  readonly portalItem?: EsriPortalItem;
  readonly title?: string;
}

/**
 * Extracts the title from an ESRI map, preferring the portal item title.
 * Falls back to the map's direct title property if no portal item exists.
 * 
 * @param map - The ESRI map object (may have portalItem at runtime)
 * @returns The map title, or undefined if no title is available
 */
export function getMapTitle(map: __esri.Map | null | undefined): string | undefined {
  if (!map) return undefined;
  
  // Cast to our extended interface to access portalItem
  const mapWithPortal = map as EsriMapWithPortalItem;
  return mapWithPortal.portalItem?.title || mapWithPortal.title || undefined;
}
