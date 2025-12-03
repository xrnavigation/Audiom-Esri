/**
 * String enumeration for all ArcGIS layer types
 * Used for type-safe layer type checking throughout the application
 */
export enum LayerTypes {
  /** Vector features from ArcGIS FeatureServer/MapServer or client-side graphics */
  FEATURE = 'feature',
  /** Raster or vector data exported as a single image from ArcGIS MapServer, may contain sublayers */
  MAP_IMAGE = 'map-image',
  /** Comma-separated values file (CSV) with location data */
  CSV = 'csv',
  /** GeoJSON formatted data (RFC 7946 compliant) */
  GEOJSON = 'geojson',
  /** Client-side graphics layer for displaying graphics without a data source */
  GRAPHICS = 'graphics',
  /** Container layer that groups other layers together */
  GROUP = 'group',
  /** Raster image data from an imagery service */
  IMAGE = 'image',
  /** Raster imagery data from ArcGIS ImageServer with client-side filtering */
  IMAGERY = 'imagery',
  /** Tiled raster imagery from ArcGIS ImageServer */
  IMAGERY_TILE = 'imagery-tile',
  /** Video or image media element displayed at geographic locations */
  MEDIA = 'media',
  /** OpenStreetMap tile layer */
  OPEN_STREET_MAP = 'osm',
  /** Raster data from various sources */
  RASTER = 'raster',
  /** Real-time streaming data layer */
  STREAM = 'stream',
  /** Pre-rendered image tiles from ArcGIS MapServer */
  TILE = 'tile',
  /** Vector tiles from ArcGIS portal item or service */
  VECTOR_TILE = 'vector-tile',
  /** Custom tile layer from non-ArcGIS, non-OGC tile services */
  WEB_TILE = 'web-tile',
  /** Web Map Service (WMS) layer from OGC compliant service */
  WMS = 'wms',
  /** Web Map Tile Service (WMTS) layer from OGC compliant service */
  WMTS = 'wmts',
  /** Layer type that is not recognized or supported */
  UNKNOWN = 'unknown'
}
