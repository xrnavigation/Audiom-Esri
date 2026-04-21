import { AudiomSource, MapType } from "../../../../shared/audiom-client/AudiomSource";
import { AudiomEmbedConfig } from "../../../../shared/audiom-client/AudiomEmbedConfig";
import { StepSize } from "../../../../shared/audiom-client/StepSize";
import { GeoQuad } from "../../../../shared/audiom-client/GeoQuad";
import { Coordinates } from "../../../../shared/audiom-client/Coordinates";
import { raw } from "../../../../shared/audiom-client/expressions";
import { toEsriSql } from "../../../../shared/audiom-client/expressions/serializers/EsriSqlSerializer";
import { TimeExtent as AudiomTimeExtent } from "../../../../shared/audiom-client/expressions/temporal/EsriTemporalFilter";
import { DateTimeInterval } from "../../../../shared/audiom-client/expressions/temporal/DateTimeFilter";
import { JimuMapView, MapViewManager } from "jimu-arcgis";
import FeatureLayer from 'esri/layers/FeatureLayer';
import CSVLayer from 'esri/layers/CSVLayer';
import GeoJSONLayer from 'esri/layers/GeoJSONLayer';
import MapImageLayer from 'esri/layers/MapImageLayer';
import { DEFAULT_CONFIG, DEFAULT_SOURCE_CONFIG, IAudiomConfig, IFilterConfig } from "../setting/configs";
import { FilterType } from "../setting/enums";
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

/**
 * Validates if the Audiom config is ready for use.
 * Checks API key and validates coordinates, zoom, and step size.
 */
export function isAudiomConfigValid(config: IAudiomConfig): boolean {
  return isConfigValid(config);
}

/**
 * Combine a list of filter expressions into a single SQL WHERE clause.
 * Non-empty expressions are wrapped in parentheses and joined with AND.
 * Only includes 'where' type filters (or filters with no type, for backwards compatibility).
 * @returns The combined expression string, or undefined if no valid filters.
 */
export function combineFilterExpressions(filters: IFilterConfig[]): string | undefined {
  const expressions = filters
    .filter(f => !f.filterType || f.filterType === FilterType.Where)
    .map(f => f.expression?.trim())
    .filter((expr): expr is string => !!expr)
    .map(expr => `(${expr})`)
  return expressions.length > 0 ? expressions.join(' AND ') : undefined
}

/**
 * Combine temporal (when) filters into a TimeExtent for Esri queries.
 * Each 'when' filter expression is an ISO 8601 interval: "start/end"
 * where start and end are ISO date strings or epoch milliseconds.
 * Returns the tightest intersection of all time ranges.
 */
export function combineTimeFilters(filters: IFilterConfig[]): { start: number | null, end: number | null } | undefined {
  const timeFilters = filters.filter(f => f.filterType === FilterType.When)
  if (timeFilters.length === 0) return undefined

  let latestStart: number | null = null
  let earliestEnd: number | null = null

  for (const f of timeFilters) {
    const expr = f.expression?.trim()
    if (!expr) continue
    const interval = DateTimeInterval.fromOgcDateTimeParam(expr)
    if (!interval) continue

    if (interval.start !== null) {
      const ms = interval.start.getTime()
      latestStart = latestStart !== null ? Math.max(latestStart, ms) : ms
    }
    if (interval.end !== null) {
      const ms = interval.end.getTime()
      earliestEnd = earliestEnd !== null ? Math.min(earliestEnd, ms) : ms
    }
  }

  if (latestStart === null && earliestEnd === null) return undefined
  return { start: latestStart, end: earliestEnd }
}

/**
 * Format a layer's timeExtent as an ISO 8601 interval string.
 */
function formatTimeExtent(timeExtent: { start?: Date, end?: Date }): string | undefined {
  if (!timeExtent) return undefined
  const start = timeExtent.start ?? null
  const end = timeExtent.end ?? null
  if (start === null && end === null) return undefined
  return DateTimeInterval.create(start, end).toOgcDateTimeParam()
}

export function audiomConfigToEmbedConfig(config: IAudiomConfig, jmv: JimuMapView | undefined): AudiomEmbedConfig {
  logger.debug('audiomConfigToEmbedConfig - useExistingMap:', config.useExistingMap);

  const sources = resolveSources(config, jmv);

  // When runtime auto-sync is enabled, expose the parent origin to the embed
  // so the Audiom postMessage API is enabled. Without this query param Audiom
  // rejects all inbound commands. Defaults to true when the field is absent.
  const runtimeAutoSync = config.runtimeAutoSync ?? DEFAULT_CONFIG.runtimeAutoSync;
  const allowedOrigins = runtimeAutoSync && typeof window !== 'undefined'
    ? window.location.origin
    : undefined;

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
    visualBaseLayers: config.visualBaseLayers && config.visualBaseLayers.length > 0
      ? config.visualBaseLayers.map(layer => ({
          url: layer.url,
          position: layer.position ? GeoQuad.parse(layer.position) : undefined,
        }))
      : undefined,
    allowedOrigins,
  });
}

/**
 * Resolve the source list for an embed config.
 *
 * - When `useExistingMap` is on, prefer sources extracted from the live
 *   JimuMapView (filtered by the per-source `enabled` flag in config). If the
 *   map view returns nothing (not ready, no layers, etc.) fall back to the
 *   sources stored directly in the config.
 * - When `useExistingMap` is off, always use the config sources.
 */
function resolveSources(config: IAudiomConfig, jmv: JimuMapView | undefined): AudiomSource[] {
  if (!config.useExistingMap) {
    return getSourcesFromConfig(config);
  }

  const mapSources = getSourcesFromEsriMap(jmv, config);
  if (mapSources.length === 0) {
    logger.debug('No sources from map view, falling back to config sources');
    return getSourcesFromConfig(config);
  }

  // Respect per-source enabled flag (default true when no matching config entry).
  return mapSources.filter(mapSource => {
    const sourceConfig = config.sourceConfigs?.find(sc =>
      sc.sourceUrl === mapSource.url || sc.source === mapSource.source
    );
    return sourceConfig ? sourceConfig.enabled !== false : true;
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
      const combinedWhere = combineFilterExpressions(sourceConfig.filters || [])
      const combinedTime = combineTimeFilters(sourceConfig.filters || [])
      const source = AudiomSource.fromEsri({
        name: sourceConfig.name,
        source: sourceConfig.source,
        url: sourceConfig.sourceUrl,
        mapType: sourceConfig.mapType || DEFAULT_SOURCE_CONFIG.mapType,
        rules: sourceConfig.rulesFileUrl || '',
        where: combinedWhere ? raw(combinedWhere) : undefined,
        time: combinedTime ? AudiomTimeExtent.fromEpochMs(combinedTime.start, combinedTime.end) : undefined
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
    logger.warn(`No map view available for map ID: ${mapId}`);
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
  return getSourceLayerPairsFromEsriMap(jimuMapView, config).map(p => p.source);
}

/**
 * Like {@link getSourcesFromEsriMap}, but also returns the originating Esri
 * layer alongside each source. Walks the operational layers exactly once.
 *
 * For sublayer-bearing layers (e.g. MapImageLayer) the returned `layer` is
 * the parent layer that carries the `visible`/`timeExtent` properties — not
 * the sublayer — which is what callers actually need.
 */
export function getSourceLayerPairsFromEsriMap(
  jimuMapView: JimuMapView | undefined,
  config?: IAudiomConfig
): Array<{ source: AudiomSource, layer: __esri.Layer }> {
  if (!jimuMapView || !jimuMapView.view) {
    logger.warn('No map view available');
    return [];
  }

  const map = jimuMapView.view.map;
  const operationalLayers = getOperationalLayers(map);

  logger.debug(`map.layers: ${map.layers.length}, map.allLayers: ${map.allLayers.length}, filtered: ${operationalLayers.length}`);

  const pairs: Array<{ source: AudiomSource, layer: __esri.Layer }> = [];
  operationalLayers.forEach((layer) => {
    processLayer(layer).forEach(source => pairs.push({ source, layer }));
  });

  // Merge rules and mapType from config if provided
  if (config) {
    pairs.forEach(({ source }) => {
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

  logger.debug(`Extracted ${pairs.length} sources from map`);
  return pairs;
}

/**
 * Removes rules file URLs from source configs for diff comparison.
 * Rules files should not trigger a map change detection.
 */
export function sanitizeSourceConfigsForDiff<T extends { rulesFileUrl?: string }>(sourceConfigs: T[]): T[] {
  return sourceConfigs.map((sc): T => ({ ...sc, rulesFileUrl: undefined }));
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
    filters?: IFilterConfig[];
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
    filters?: IFilterConfig[];
    enabled?: boolean;
  }> = [];

  // Get sources from map (without config, so no rules merged) — paired with
  // their originating layer so we can read visibility/timeExtent without a
  // second pass over allLayers.
  const sourceLayerPairs = getSourceLayerPairsFromEsriMap(jimuMapView);

  sourceLayerPairs.forEach(({ source, layer }) => {
    const filters: IFilterConfig[] = []
    if (source.where) {
      const expr = toEsriSql(source.where)
      filters.push({ expression: expr, mapExpression: expr, filterType: FilterType.Where, mapFilterType: FilterType.Where, locked: true, fromMap: true })
    }
    // Extract timeExtent from the layer if available (FeatureLayer, etc.)
    const layerTimeExtent = (layer as any)?.timeExtent
    if (layerTimeExtent) {
      const timeExpr = formatTimeExtent(layerTimeExtent)
      if (timeExpr) {
        filters.push({ expression: timeExpr, mapExpression: timeExpr, filterType: FilterType.When, mapFilterType: FilterType.When, locked: true, fromMap: true })
      }
    }

    sourceConfigs.push({
      name: source.name,
      source: source.source,
      sourceUrl: source.url,
      mapType: source.mapType,
      filters,
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
  logger.debug(`Processing layer: ${layer.title} (type: ${layer.type})`);

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

  logger.debug(`Found FeatureLayer: ${layer.title} - ${layer.url}`);
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

  logger.debug(`Found CSV layer: ${layer.title} - ${layer.url}`);
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
  
  logger.debug(`Found GeoJSON layer: ${layer.title} - ${layer.url}`);
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
    logger.debug(`Found sublayer: ${sublayer.title} - ${sublayer.url}`);
  });

  return sources;
}
