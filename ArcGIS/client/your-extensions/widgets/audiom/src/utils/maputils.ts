import { AudiomSource, MapType } from "../../../../shared/audiom-client/AudiomSource";
import { AudiomEmbedConfig } from "../../../../shared/audiom-client/AudiomEmbedConfig";
import { StepSize } from "../../../../shared/audiom-client/StepSize";
import { IAudiomConfig } from "../setting/types";
import { JimuMapView, MapViewManager } from "jimu-arcgis";
import FeatureLayer from 'esri/layers/FeatureLayer';
import CSVLayer from 'esri/layers/CSVLayer';
import GeoJSONLayer from 'esri/layers/GeoJSONLayer';
import MapImageLayer from 'esri/layers/MapImageLayer';
import { LayerTypes } from "../../../../shared/constants/LayerTypes";

// Constants
const DEFAULT_FEATURE_LAYER_NAME = 'Feature Layer';
const DEFAULT_CSV_LAYER_NAME = 'CSV Layer';
const DEFAULT_GEOJSON_LAYER_NAME = 'GeoJSON Layer';
const DEFAULT_SUBLAYER_NAME = 'Sublayer';
const LOG_NO_MAP_VIEW = 'No map view available';
const LOG_PROCESSING_LAYER = 'Processing layer:';
const LOG_FOUND_FEATURE_LAYER = 'Found FeatureLayer:';
const LOG_FOUND_CSV_LAYER = 'Found CSV layer:';
const LOG_FOUND_GEOJSON_LAYER = 'Found GeoJSON layer:';
const LOG_FOUND_SUBLAYER = 'Found sublayer:';
const LOG_EXTRACTED_SOURCES = 'Extracted';

export function audiomConfigToEmbedConfig(config: IAudiomConfig, jmv: JimuMapView | undefined): AudiomEmbedConfig {
  const mapViewManager = MapViewManager.getInstance();
  const sources: AudiomSource[] = [];

  console.log('audiomConfigToEmbedConfig - useExistingMap:', config.useExistingMap);

  if (config.useExistingMap) {
    const jimuMapView = jmv;
    const mapSources = getSourcesFromEsriMap(jimuMapView);

    // Filter sources based on enabled status from config
    const enabledSources = mapSources.filter(mapSource => {
      const sourceConfig = config.sourceConfigs?.find(sc => 
        sc.sourceUrl === mapSource.url || sc.source === mapSource.source
      );
      // If source is in config, respect its enabled status; otherwise include it (default enabled)
      return sourceConfig ? sourceConfig.enabled !== false : true;
    });

    sources.push(...enabledSources);
  } else {
    const configSources = getSourcesFromConfig(config);
    sources.push(...configSources);
  }

  return AudiomEmbedConfig.dynamic({
    apiKey: config.apiKey || '',
    sources: sources,
    center: [config.centerLongitude || 0, config.centerLatitude || 0],
    showVisualMap: config.showVisualMap ?? true,
    showHeading: config.showHeading ?? false,
    zoom: config.zoom ?? 10,
    heading: config.heading,
    stepSize: StepSize.Kilometers(config.stepSize ?? 1),
  });
}

export function getSourcesFromConfig(config: IAudiomConfig): AudiomSource[] {
  const sourceConfigs = config?.sourceConfigs || [];

  const sources: AudiomSource[] = [];
  sourceConfigs.forEach((sourceConfig) => {
    // Skip disabled sources
    if (sourceConfig.enabled === false) {
      return;
    }

    if (sourceConfig?.sourceUrl) {
      const source = AudiomSource.fromEsri({
        name: sourceConfig.name,
        source: sourceConfig.source,
        url: sourceConfig.sourceUrl,
        mapType: sourceConfig.mapType || MapType.Indoor,
        rules: sourceConfig.rulesFileUrl || ''
      });
      sources.push(source);
    }
  });
  return sources;
}

export function getJimuMapViewById(mapId: string, mapViewManager?: MapViewManager): JimuMapView | undefined {
  if (!mapViewManager) {
    console.warn('MapViewManager not provided');
    return undefined;
  }

  const jimuMapViews = mapViewManager.getJimuMapViewGroup(mapId)?.jimuMapViews;
  if (!jimuMapViews || Object.keys(jimuMapViews).length === 0) {
    console.warn(`${LOG_NO_MAP_VIEW} for map ID: ${mapId}`);
    return undefined;
  }

  console.log(`Found ${Object.keys(jimuMapViews).length} JimuMapViews for map ID: ${mapId}`);

  // Get the first available JimuMapView from the group
  return Object.values(jimuMapViews)[0];
}

export function getSourcesFromEsriMap(jimuMapView: JimuMapView | undefined): AudiomSource[] {
  if (!jimuMapView || !jimuMapView.view) {
    console.warn(LOG_NO_MAP_VIEW);
    return [];
  }

  const sources: AudiomSource[] = [];
  const map = jimuMapView.view.map;

  map.layers.forEach((layer) => {
    const layerSources = processLayer(layer);
    sources.push(...layerSources);
  });

  console.log(`${LOG_EXTRACTED_SOURCES} ${sources.length} sources from map`);
  return sources;
}

export function extractMapConfigFromEsriMap(mapId: string, mapViewManager?: MapViewManager): {
  centerLatitude?: number;
  centerLongitude?: number;
  zoom?: number;
  sourceConfigs?: Array<{
    name?: string;
    source?: string;
    sourceUrl?: string;
    mapType?: MapType;
    rulesFileUrl?: string;
    enabled?: boolean;
  }>;
} | null {
  const jimuMapView = getJimuMapViewById(mapId, mapViewManager);

  if (!jimuMapView || !jimuMapView.view) {
    return null;
  }

  const view = jimuMapView.view;
  const center = view.center;
  const zoom = view.zoom;

  // Extract sources from the map
  const sources = getSourcesFromEsriMap(jimuMapView);
  const sourceConfigs = sources.map(source => ({
    name: source.name,
    source: source.source,
    sourceUrl: source.url,
    mapType: source.mapType,
    rulesFileUrl: source.rules,
    enabled: true // Default to enabled when extracted from map
  }));

  return {
    centerLatitude: center.latitude,
    centerLongitude: center.longitude,
    zoom: zoom,
    sourceConfigs: sourceConfigs.length > 0 ? sourceConfigs : undefined
  };
}

function processLayer(layer: __esri.Layer): AudiomSource[] {
  console.log(`${LOG_PROCESSING_LAYER} ${layer.title} (type: ${layer.type})`);

  let source: AudiomSource | null = null;

  switch (layer.type) {
    case LayerTypes.FEATURE:
      source = processFeatureLayer(layer as FeatureLayer);
      return source ? [source] : [];

    case LayerTypes.CSV:
      source = processCSVLayer(layer as CSVLayer);
      return source ? [source] : [];

    case LayerTypes.GEOJSON:
      source = processGeoJSONLayer(layer as GeoJSONLayer);
      return source ? [source] : [];

    case LayerTypes.MAP_IMAGE:
      return processMapImageLayer(layer as MapImageLayer);

    default:
      return [];
  }
}

function processFeatureLayer(layer: FeatureLayer | null): AudiomSource | null {
  if (!layer || !layer.url) {
    return null;
  }

  const source = AudiomSource.fromEsri({
    name: layer.title || DEFAULT_FEATURE_LAYER_NAME,
    source: layer.id,
    url: `${layer.url}/${layer.layerId}`,
    mapType: MapType.Indoor
  });

  console.log(`${LOG_FOUND_FEATURE_LAYER} ${layer.title} - ${layer.url}`);
  return source;
}

function processCSVLayer(layer: CSVLayer | null): AudiomSource | null {
  if (!layer || !layer.url) {
    return null;
  }

  const source = AudiomSource.fromGeoJsonUrl(
    layer.url,
    layer.title || DEFAULT_CSV_LAYER_NAME
  );

  console.log(`${LOG_FOUND_CSV_LAYER} ${layer.title} - ${layer.url}`);
  return source;
}

function processGeoJSONLayer(layer: GeoJSONLayer | null): AudiomSource | null {
  if (!layer || !layer.url) {
    return null;
  }

  const source = AudiomSource.fromGeoJsonUrl(
    layer.url,
    layer.title || DEFAULT_GEOJSON_LAYER_NAME
  );
  
  console.log(`${LOG_FOUND_GEOJSON_LAYER} ${layer.title} - ${layer.url}`);
  return source;
}

function processMapImageLayer(layer: MapImageLayer | null): AudiomSource[] {
  const sources: AudiomSource[] = [];

  if (!layer || !layer.sublayers) {
    return sources;
  }

  layer.sublayers.forEach((sublayer) => {
    if (!sublayer.url) {
      return;
    }

    const source = AudiomSource.fromEsri({
      name: sublayer.title || DEFAULT_SUBLAYER_NAME,
      source: `${layer.id}_${sublayer.id}`,
      url: sublayer.url,
      mapType: MapType.Indoor
    });

    sources.push(source);
    console.log(`${LOG_FOUND_SUBLAYER} ${sublayer.title} - ${sublayer.url}`);
  });

  return sources;
}
