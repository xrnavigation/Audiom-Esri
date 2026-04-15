import { AudiomSource, MapType } from "../../../../shared/audiom-client/AudiomSource";
import { AudiomEmbedConfig } from "../../../../shared/audiom-client/AudiomEmbedConfig";
import { StepSize } from "../../../../shared/audiom-client/StepSize";
import { GeoQuad } from "../../../../shared/audiom-client/GeoQuad";
import { Coordinates } from "../../../../shared/audiom-client/Coordinates";
import { raw } from "../../../../shared/audiom-client/expressions";
import { toEsriSql } from "../../../../shared/audiom-client/expressions/serializers/EsriSqlSerializer";
import { JimuMapView, MapViewManager } from "jimu-arcgis";
import FeatureLayer from 'esri/layers/FeatureLayer';
import CSVLayer from 'esri/layers/CSVLayer';
import GeoJSONLayer from 'esri/layers/GeoJSONLayer';
import MapImageLayer from 'esri/layers/MapImageLayer';
import { DEFAULT_CONFIG, DEFAULT_SOURCE_CONFIG, IAudiomConfig } from "../setting/configs";
import { isConfigValid } from "../setting/validation/validation";
import { createLogger } from './logger';
import { LayerType, isExcludedLayerType } from './mapEnums';
import { getMapTitle } from './esriTypes';

const logger = createLogger('MapUtils');

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

/**
 * Validates if the Audiom config is ready for use.
 * Checks API key and validates coordinates, zoom, and step size.
 */
export function isAudiomConfigValid(config: IAudiomConfig): boolean {
  return isConfigValid(config);
}

export function audiomConfigToEmbedConfig(config: IAudiomConfig, jmv: JimuMapView | undefined): AudiomEmbedConfig {
  const mapViewManager = MapViewManager.getInstance();
  const sources: AudiomSource[] = [];

  logger.debug('audiomConfigToEmbedConfig - useExistingMap:', config.useExistingMap);

  if (config.useExistingMap) {
    const jimuMapView = jmv;
    // Get sources from map and merge in rules from config
    const mapSources = getSourcesFromEsriMap(jimuMapView, config);

    // If map view is not available or returns no sources, fall back to config sources
    if (mapSources.length === 0) {
      logger.debug('No sources from map view, falling back to config sources');
      const configSources = getSourcesFromConfig(config);
      sources.push(...configSources);
    } else {
      // Filter sources based on enabled status from config
      const enabledSources = mapSources.filter(mapSource => {
        const sourceConfig = config.sourceConfigs?.find(sc => 
          sc.sourceUrl === mapSource.url || sc.source === mapSource.source
        );
        // If source is in config, respect its enabled status; otherwise include it (default enabled)
        return sourceConfig ? sourceConfig.enabled !== false : true;
      });

      sources.push(...enabledSources);
    }
  } else {
    const configSources = getSourcesFromConfig(config);
    sources.push(...configSources);
  }

  return AudiomEmbedConfig.dynamic({
    apiKey: config.apiKey || '',
    sources: sources,
    center: Coordinates.create(config.centerLongitude ?? DEFAULT_CONFIG.centerLongitude, config.centerLatitude ?? DEFAULT_CONFIG.centerLatitude),
    showVisualMap: config.showVisualMap ?? DEFAULT_CONFIG.showVisualMap,
    showHeading: config.showHeading ?? DEFAULT_CONFIG.showHeading,
    zoom: config.zoom ?? DEFAULT_CONFIG.zoom,
    heading: config.heading,
    stepSize: StepSize.create(config.stepSize ?? DEFAULT_CONFIG.stepSize, config.stepSizeUnit ?? DEFAULT_CONFIG.stepSizeUnit),
    soundpack: config.soundpackUrl || undefined,
    title: config.title || undefined,
    visualStyle: config.visualStyle || undefined,
    visualBaseLayer: config.visualBaseLayer || undefined,
    visualBaseLayerPosition: config.visualBaseLayerPosition ? GeoQuad.parse(config.visualBaseLayerPosition) : undefined,
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
        mapType: sourceConfig.mapType || DEFAULT_SOURCE_CONFIG.mapType,
        rules: sourceConfig.rulesFileUrl || '',
        where: sourceConfig.where ? raw(sourceConfig.where) : undefined
      });
      sources.push(source);
    }
  });
  return sources;
}

export function getJimuMapViewById(mapId: string, mapViewManager?: MapViewManager): JimuMapView | undefined {
  if (!mapViewManager) {
    logger.warn('MapViewManager not provided');
    return undefined;
  }

  const jimuMapViews = mapViewManager.getJimuMapViewGroup(mapId)?.jimuMapViews;
  if (!jimuMapViews || Object.keys(jimuMapViews).length === 0) {
    logger.warn(`${LOG_NO_MAP_VIEW} for map ID: ${mapId}`);
    return undefined;
  }

  logger.debug(`Found ${Object.keys(jimuMapViews).length} JimuMapViews for map ID: ${mapId}`);

  // Get the first available JimuMapView from the group
  return Object.values(jimuMapViews)[0];
}

/**
 * Filters out basemap and tile layers from a map's allLayers collection.
 * Returns only operational layers that can be used as data sources.
 */
function getOperationalLayers(map: __esri.Map): __esri.Collection<__esri.Layer> {
  return map.allLayers.filter(layer => 
    !isExcludedLayerType(layer.type) &&
    !map.basemap?.baseLayers?.includes(layer)
  );
}

export function getSourcesFromEsriMap(
  jimuMapView: JimuMapView | undefined,
  config?: IAudiomConfig
): AudiomSource[] {
  if (!jimuMapView || !jimuMapView.view) {
    logger.warn(LOG_NO_MAP_VIEW);
    return [];
  }

  const sources: AudiomSource[] = [];
  const map = jimuMapView.view.map;

  // Use allLayers to include sublayers; filter out basemap/tile layers
  // map.layers only contains top-level operational layers and may be empty
  // if accessed before the WebMap is fully loaded
  const operationalLayers = getOperationalLayers(map);

  logger.debug(`map.layers: ${map.layers.length}, map.allLayers: ${map.allLayers.length}, filtered: ${operationalLayers.length}`);

  operationalLayers.forEach((layer) => {
    const layerSources = processLayer(layer);
    sources.push(...layerSources);
  });

  // Merge rules and mapType from config if provided
  if (config) {
    sources.forEach(source => {
      const sourceConfig = config.sourceConfigs?.find(sc => 
        sc.sourceUrl === source.url || sc.source === source.source
      );
      if (sourceConfig) {
        if (sourceConfig.rulesFileUrl) {
          source.rules = sourceConfig.rulesFileUrl;
        }
        if (sourceConfig.mapType) {
          source.mapType = sourceConfig.mapType;
        }
      }
    });
  }

  logger.debug(`${LOG_EXTRACTED_SOURCES} ${sources.length} sources from map`);
  return sources;
}

/**
 * Removes rules file URLs from source configs for diff comparison.
 * Rules files should not trigger a map change detection.
 */
export function sanitizeSourceConfigsForDiff<T extends { rulesFileUrl?: string }>(sourceConfigs: T[]): T[] {
  return sourceConfigs.map(sc => ({ ...sc, rulesFileUrl: undefined }));
}

export function extractMapConfigFromEsriMap(mapId: string, mapViewManager?: MapViewManager): {
  title?: string;
  centerLatitude?: number;
  centerLongitude?: number;
  zoom?: number;
  sourceConfigs?: Array<{
    name?: string;
    source?: string;
    sourceUrl?: string;
    mapType?: MapType;
    rulesFileUrl?: string;
    where?: string;
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
  
  // Extract title from the map's portal item if available
  const mapTitle = getMapTitle(view.map);
  
  // Extract sources from the map, respecting layer visibility
  // Use allLayers and filter out basemap layers
  const sourceConfigs: Array<{
    name?: string;
    source?: string;
    sourceUrl?: string;
    mapType?: MapType;
    rulesFileUrl?: string;
    where?: string;
    enabled?: boolean;
  }> = [];

  // Get sources from map (without config, so no rules merged)
  const layerSources = getSourcesFromEsriMap(jimuMapView);
  
  layerSources.forEach(source => {
    // Find the corresponding layer to get visibility
    const layer = view.map.allLayers.find(l => 
      l.id === source.source || l.id === source.source.split('_')[0]
    );
    
    sourceConfigs.push({
      name: source.name,
      source: source.source,
      sourceUrl: source.url,
      mapType: source.mapType,
      where: source.where ? toEsriSql(source.where) : undefined,
      // Don't include rulesFileUrl - it's not from the map and shouldn't affect diff
      enabled: layer?.visible ?? true
    });
  });

  // Esri zoom levels are 1 higher than the equivalent for Audiom/Mapbox
  // https://developers.arcgis.com/documentation/spatial-analysis-services/reference/zoom-levels-scale/
  const esriToAudiomZoomOffset = 1;

  return {
    title: mapTitle,
    centerLatitude: center.latitude,
    centerLongitude: center.longitude,
    zoom: Math.max(zoom - esriToAudiomZoomOffset, 0),
    sourceConfigs: sourceConfigs.length > 0 ? sourceConfigs : undefined
  };
}

function processLayer(layer: __esri.Layer): AudiomSource[] {
  logger.debug(`${LOG_PROCESSING_LAYER} ${layer.title} (type: ${layer.type})`);

  let source: AudiomSource | null = null;

  switch (layer.type) {
    case LayerType.FEATURE:
      source = processFeatureLayer(layer as FeatureLayer);
      return source ? [source] : [];

    case LayerType.CSV:
      source = processCSVLayer(layer as CSVLayer);
      return source ? [source] : [];

    case LayerType.GEOJSON:
      source = processGeoJSONLayer(layer as GeoJSONLayer);
      return source ? [source] : [];

    case LayerType.MAP_IMAGE:
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
    mapType: MapType.Indoor,
    where: layer.definitionExpression ? raw(layer.definitionExpression) : undefined
  });

  logger.debug(`${LOG_FOUND_FEATURE_LAYER} ${layer.title} - ${layer.url}`);
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

  logger.debug(`${LOG_FOUND_CSV_LAYER} ${layer.title} - ${layer.url}`);
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
  
  logger.debug(`${LOG_FOUND_GEOJSON_LAYER} ${layer.title} - ${layer.url}`);
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
      mapType: MapType.Indoor,
      where: (sublayer as any).definitionExpression ? raw((sublayer as any).definitionExpression) : undefined
    });

    sources.push(source);
    logger.debug(`${LOG_FOUND_SUBLAYER} ${sublayer.title} - ${sublayer.url}`);
  });

  return sources;
}
