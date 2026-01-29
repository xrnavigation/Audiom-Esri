/**
 * All possible layer types in ArcGIS JS API
 * @see https://developers.arcgis.com/javascript/latest/api-reference/esri-layers-Layer.html#type
 */
export enum LayerType {
  // Base/Tile Layers
  TILE = 'tile',
  VECTOR_TILE = 'vector-tile',
  IMAGERY_TILE = 'imagery-tile',
  WEB_TILE = 'web-tile',
  BASE_TILE = 'base-tile',
  OPEN_STREET_MAP = 'open-street-map',
  BING_MAPS = 'bing-maps',

  // Feature/Data Layers
  FEATURE = 'feature',
  CSV = 'csv',
  GEOJSON = 'geojson',
  GEO_RSS = 'geo-rss',
  KML = 'kml',
  WFS = 'wfs',
  OGC_FEATURE = 'ogc-feature',
  PARQUET = 'parquet',

  // Image/Raster Layers
  IMAGERY = 'imagery',
  GEOREFERENCED_IMAGE = 'georeferenced-image',
  MAP_IMAGE = 'map-image',
  WMS = 'wms',
  WMTS = 'wmts',
  WCS = 'wcs',

  // 3D Layers
  SCENE = 'scene',
  INTEGRATED_MESH = 'integrated-mesh',
  POINT_CLOUD = 'point-cloud',
  BUILDING_SCENE = 'building-scene',
  VOXEL = 'voxel',
  INTEGRATED_MESH_3D_TILES = 'integrated-mesh-3dtiles',

  // Graphics/Drawing Layers
  GRAPHICS = 'graphics',
  ROUTE = 'route',

  // Grouped Layers
  GROUP = 'group',
  MAP_NOTES = 'map-notes',
  CATALOG = 'catalog',
  CATALOG_FOOTPRINT = 'catalog-footprint',
  CATALOG_DYNAMIC_GROUP = 'catalog-dynamic-group',
  SUBTYPE_GROUP = 'subtype-group',
  DIMENSION = 'dimension',
  ORIENTED_IMAGERY = 'oriented-imagery',
  LINK_CHART = 'link-chart',
  
  // Elevation Layers
  ELEVATION = 'elevation',
  BASE_ELEVATION = 'base-elevation',
  BASE_DYNAMIC = 'base-dynamic',

  // Stream/Real-time Layers
  STREAM = 'stream',

  // Media Layers
  MEDIA = 'media',
  VIDEO = 'video',

  // Knowledge Graph
  KNOWLEDGE_GRAPH = 'knowledge-graph',
  KNOWLEDGE_GRAPH_SUBLAYER = 'knowledge-graph-sublayer',

  // Utility Network
  LINE_OF_SIGHT = 'line-of-sight',
  VIEWSHED = 'viewshed',

  // Unknown/Unsupported
  UNKNOWN = 'unknown',
  UNSUPPORTED = 'unsupported'
}

/**
 * Layer types that should be excluded when extracting operational layers.
 * These are typically basemap or tile-based layers that don't contain feature data.
 */
export const EXCLUDED_LAYER_TYPES: LayerType[] = [
  LayerType.TILE,
  LayerType.VECTOR_TILE,
  LayerType.IMAGERY_TILE,
  LayerType.WEB_TILE,
  LayerType.BASE_TILE,
  LayerType.OPEN_STREET_MAP,
  LayerType.BING_MAPS,
  LayerType.BASE_DYNAMIC
];

/**
 * Layer types that can be used as data sources for Audiom.
 */
export const DATA_SOURCE_LAYER_TYPES: LayerType[] = [
  LayerType.FEATURE,
  LayerType.CSV,
  LayerType.GEOJSON,
  LayerType.MAP_IMAGE
];

/**
 * Checks if a layer type should be excluded from operational layers.
 */
export function isExcludedLayerType(layerType: string): boolean {
  return EXCLUDED_LAYER_TYPES.includes(layerType as LayerType);
}

/**
 * Checks if a layer type can be used as a data source.
 */
export function isDataSourceLayerType(layerType: string): boolean {
  return DATA_SOURCE_LAYER_TYPES.includes(layerType as LayerType);
}
