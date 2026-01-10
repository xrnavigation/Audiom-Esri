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
    //const jimuMapView = getJimuMapViewById(config.existingMapId, mapViewManager);
    const jimuMapView = jmv;
    const mapSources = getSourcesFromEsriMap(jimuMapView);
    sources.push(...mapSources);
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
  const sourceConfig = config?.sourceConfig;

  let sources: AudiomSource[] = [];
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

function processLayer(layer: __esri.Layer): AudiomSource[] {
  console.log(`${LOG_PROCESSING_LAYER} ${layer.title} (type: ${layer.type})`);

  let source: AudiomSource | null = null;

  switch (layer.type) {
    case LayerTypes.FEATURE:
      source = processFeatureLayer(layer);
      return source ? [source] : [];

    case LayerTypes.CSV:
      source = processCSVLayer(layer);
      return source ? [source] : [];

    case LayerTypes.GEOJSON:
      source = processGeoJSONLayer(layer);
      return source ? [source] : [];

    case LayerTypes.MAP_IMAGE:
      return processMapImageLayer(layer);

    default:
      return [];
  }
}

function processFeatureLayer(layer: __esri.Layer): AudiomSource | null {
  const featureLayer = layer as FeatureLayer;
  
  if (!featureLayer.url) {
    return null;
  }

  const source = AudiomSource.fromEsri({
    name: featureLayer.title || DEFAULT_FEATURE_LAYER_NAME,
    source: featureLayer.id,
    url: `${featureLayer.url}/${featureLayer.layerId}`,
    mapType: MapType.Indoor
  });
  
  console.log(`${LOG_FOUND_FEATURE_LAYER} ${featureLayer.title} - ${featureLayer.url}`);
  return source;
}

function processCSVLayer(layer: __esri.Layer): AudiomSource | null {
  const csvLayer = layer as CSVLayer;
  
  if (!csvLayer.url) {
    return null;
  }

  const source = AudiomSource.fromGeoJsonUrl(
    csvLayer.url,
    csvLayer.title || DEFAULT_CSV_LAYER_NAME
  );
  
  console.log(`${LOG_FOUND_CSV_LAYER} ${csvLayer.title} - ${csvLayer.url}`);
  return source;
}

function processGeoJSONLayer(layer: __esri.Layer): AudiomSource | null {
  const geoJsonLayer = layer as GeoJSONLayer;
  
  if (!geoJsonLayer.url) {
    return null;
  }

  const source = AudiomSource.fromGeoJsonUrl(
    geoJsonLayer.url,
    geoJsonLayer.title || DEFAULT_GEOJSON_LAYER_NAME
  );
  
  console.log(`${LOG_FOUND_GEOJSON_LAYER} ${geoJsonLayer.title} - ${geoJsonLayer.url}`);
  return source;
}

function processMapImageLayer(layer: __esri.Layer): AudiomSource[] {
  const mapImageLayer = layer as MapImageLayer;
  const sources: AudiomSource[] = [];
  
  if (!mapImageLayer.sublayers) {
    return sources;
  }

  mapImageLayer.sublayers.forEach((sublayer) => {
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
