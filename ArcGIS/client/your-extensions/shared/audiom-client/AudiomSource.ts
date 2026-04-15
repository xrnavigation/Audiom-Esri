import { Expression } from './expressions/Expression';
import { SpatialFilter } from './expressions/spatial/EsriSpatialFilter';
import { TimeInstant, TimeExtent } from './expressions/temporal/EsriTemporalFilter';
import { OrderByField, PaginationOptions } from './expressions/QueryOptions';
import type { BoundingBox } from './expressions/spatial/BoundingBox';
import { DateTimeInstant, DateTimeInterval } from './expressions/temporal/DateTimeFilter';
import { toEsriParams, toOgcParams, toOverpassQuery } from './expressions/SourceTypeSerializer';
import type { OverpassOutputOptions } from './expressions/SourceTypeSerializer';
import type { OverpassAroundFilter } from './expressions/spatial/OverpassSpatialFilter';

/**
 * Map type for rendering sources
 */
export enum MapType {
  Travel = 'travel',
  Heatmap = 'heatmap',
  Indoor = 'indoor'
}

/**
 * Source loader type
 */
export enum SourceType {
  OSM = 'osm',
  TDEI = 'TDEI',
  ESRI = 'esri',
  GeoJSON = 'geojson'
}

/**
 * Interface for a single Audiom data source
 */
export interface IAudiomSource {
  /**
   * Source name or URL to GeoJSON data
   */
  source: string;

  /**
   * Override the source loader type
   */
  type?: SourceType | string;

  /**
   * Override the map rendering type for this source
   */
  mapType?: MapType;

  /**
   * Custom display name for the source
   */
  name?: string;

  /**
   * URL for dynamic sources (required for ESRI type)
   */
  url?: string;

  /**
   * Path to rules file for this source
   */
  rules?: string;

  /**
   * Where clause / definition expression to filter features.
   * Use `parse()` to convert raw SQL strings, or the fluent builder
   * (`field('name').eq('value')`) to construct expressions.
   */
  where?: Expression;

  /**
   * Spatial filter for geometry-based queries (Esri sources)
   */
  spatialFilter?: SpatialFilter;

  /**
   * Temporal filter for time-aware layers (Esri sources)
   */
  time?: TimeInstant | TimeExtent;

  /**
   * Limit which fields/properties are returned in results.
   * Pass `['*']` to return all fields.
   *
   * @see https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/
   */
  outFields?: string[];

  /**
   * Sort results by one or more fields.
   * Use `orderBy('field', SortOrder.Descending)` to build entries.
   */
  orderByFields?: OrderByField[];

  /**
   * Pagination options: limit and offset for result sets.
   */
  pagination?: PaginationOptions;

  /**
   * Vendor-neutral bounding box filter.
   * Used by OGC/TDEI (`bbox` param) and OSM/Overpass (bbox filter).
   * For Esri sources, prefer `spatialFilter` with `SpatialFilter.fromEnvelope()`.
   */
  bbox?: BoundingBox;

  /**
   * Vendor-neutral date/time filter.
   * Used by OGC/TDEI (`datetime` param) and Overpass (date setting).
   * For Esri sources, prefer the `time` property.
   */
  datetime?: DateTimeInstant | DateTimeInterval;

  /**
   * Overpass proximity (around) filter.
   * Only applies to OSM/Overpass sources.
   */
  aroundFilter?: OverpassAroundFilter;

  /**
   * Overpass output options (format, timeout, element type, maxResults).
   * Only applies to OSM/Overpass sources.
   */
  overpassOptions?: OverpassOutputOptions;

  /**
   * Additional custom parameters for the source
   */
  additionalParams?: Record<string, string | number | boolean>;
}

/**
 * Single Audiom data source configuration
 */
export class AudiomSource implements IAudiomSource {
  source: string;
  type?: SourceType | string;
  mapType?: MapType;
  name?: string;
  url?: string;
  rules?: string;
  where?: Expression;
  spatialFilter?: SpatialFilter;
  time?: TimeInstant | TimeExtent;
  outFields?: string[];
  orderByFields?: OrderByField[];
  pagination?: PaginationOptions;
  bbox?: BoundingBox;
  datetime?: DateTimeInstant | DateTimeInterval;
  aroundFilter?: OverpassAroundFilter;
  overpassOptions?: OverpassOutputOptions;
  additionalParams?: Record<string, string | number | boolean>;

  constructor(config: IAudiomSource) {
    this.source = config.source;
    this.type = config.type;
    this.mapType = config.mapType;
    this.name = config.name;
    this.url = config.url;
    this.rules = config.rules;
    this.where = config.where;
    this.spatialFilter = config.spatialFilter;
    this.time = config.time;
    this.outFields = config.outFields;
    this.orderByFields = config.orderByFields;
    this.pagination = config.pagination;
    this.bbox = config.bbox;
    this.datetime = config.datetime;
    this.aroundFilter = config.aroundFilter;
    this.overpassOptions = config.overpassOptions;
    this.additionalParams = config.additionalParams;
  }

  /**
   * Create a simple source by name (e.g., "osm", "TDEI")
   */
  static fromName(sourceName: string): AudiomSource {
    return new AudiomSource({ source: sourceName });
  }

  /**
   * Create a source from a GeoJSON URL
   */
  static fromGeoJsonUrl(url: string, name?: string): AudiomSource {
    return new AudiomSource({
      source: url,
      type: SourceType.GeoJSON,
      name
    });
  }

  /**
   * Create an ESRI feature service source
   */
  static fromEsri(config: {
    source: string;
    url: string;
    name?: string;
    mapType?: MapType;
    rules?: string;
    where?: Expression;
    spatialFilter?: SpatialFilter;
    time?: TimeInstant | TimeExtent;
    outFields?: string[];
    orderByFields?: OrderByField[];
    pagination?: PaginationOptions;
  }): AudiomSource {
    return new AudiomSource({
      source: config.source,
      type: SourceType.ESRI,
      url: config.url,
      name: config.name,
      mapType: config.mapType,
      rules: config.rules,
      where: config.where,
      spatialFilter: config.spatialFilter,
      time: config.time,
      outFields: config.outFields,
      orderByFields: config.orderByFields,
      pagination: config.pagination,
    });
  }

  /**
   * Create an OGC API Features source (also used for TDEI).
   */
  static fromOgc(config: {
    source: string;
    url: string;
    name?: string;
    mapType?: MapType;
    rules?: string;
    where?: Expression;
    bbox?: BoundingBox;
    datetime?: DateTimeInstant | DateTimeInterval;
    outFields?: string[];
    orderByFields?: OrderByField[];
    pagination?: PaginationOptions;
  }): AudiomSource {
    return new AudiomSource({
      source: config.source,
      type: SourceType.TDEI,
      url: config.url,
      name: config.name,
      mapType: config.mapType,
      rules: config.rules,
      where: config.where,
      bbox: config.bbox,
      datetime: config.datetime,
      outFields: config.outFields,
      orderByFields: config.orderByFields,
      pagination: config.pagination,
    });
  }

  /**
   * Create an OSM / Overpass API source.
   */
  static fromOverpass(config: {
    source: string;
    url?: string;
    name?: string;
    where?: Expression;
    bbox?: BoundingBox;
    aroundFilter?: OverpassAroundFilter;
    datetime?: DateTimeInstant;
    overpassOptions?: OverpassOutputOptions;
  }): AudiomSource {
    return new AudiomSource({
      source: config.source,
      type: SourceType.OSM,
      url: config.url,
      name: config.name,
      where: config.where,
      bbox: config.bbox,
      aroundFilter: config.aroundFilter,
      datetime: config.datetime,
      overpassOptions: config.overpassOptions,
    });
  }

  /**
   * Convert to URL query parameters.
   * Returns an object with namespaced parameters for multi-source configuration.
   *
   * Delegates to source-type-specific serialization:
   * - ESRI: Esri REST API parameters (where, geometryType, spatialRel, time, etc.)
   * - TDEI: OGC API Features parameters (filter, bbox, datetime, limit, etc.)
   * - OSM: Overpass QL query body in a `data` parameter
   * - GeoJSON: minimal params (no server-side query support)
   */
  toQueryParams(): Record<string, string> {
    const params: Record<string, string> = {};

    const sourceName = this.source;

    if (this.type) {
      params[`${sourceName}.type`] = this.type;
    }
    if (this.mapType) {
      params[`${sourceName}.mapType`] = this.mapType;
    }
    if (this.name) {
      params[`${sourceName}.name`] = this.name;
    }
    if (this.url) {
      params[`${sourceName}.url`] = this.url;
    }
    if (this.rules) {
      params[`${sourceName}.rules`] = this.rules;
    }

    // Source-type-specific query parameter delegation
    const sourceTypeParams = this.serializeQueryOptions();
    Object.entries(sourceTypeParams).forEach(([key, value]) => {
      params[`${sourceName}.${key}`] = value;
    });

    if (this.additionalParams) {
      Object.entries(this.additionalParams).forEach(([key, value]) => {
        params[`${sourceName}.${key}`] = String(value);
      });
    }

    return params;
  }

  /**
   * Serialize query-related options using the appropriate strategy
   * for the source type.
   */
  private serializeQueryOptions(): Record<string, string> {
    switch (this.type) {
      case SourceType.TDEI:
        return toOgcParams({
          where: this.where,
          bbox: this.bbox,
          datetime: this.datetime,
          outFields: this.outFields,
          orderByFields: this.orderByFields,
          pagination: this.pagination,
        });

      case SourceType.OSM:
        if (this.where || this.bbox || this.aroundFilter || this.datetime) {
          const datetimeInstant = this.datetime instanceof DateTimeInstant
            ? this.datetime
            : undefined;
          return {
            data: toOverpassQuery({
              where: this.where,
              bbox: this.bbox,
              aroundFilter: this.aroundFilter,
              datetime: datetimeInstant,
              outputOptions: this.overpassOptions,
            }),
          };
        }
        return {};

      default:
        // Default to Esri behavior (covers SourceType.ESRI, GeoJSON, and unknown types)
        return this.serializeEsriQueryOptions();
    }
  }

  /**
   * Esri-specific query parameter serialization (original behavior).
   */
  private serializeEsriQueryOptions(): Record<string, string> {
    return toEsriParams({
      where: this.where,
      spatialFilter: this.spatialFilter,
      time: this.time,
      outFields: this.outFields,
      orderByFields: this.orderByFields,
      pagination: this.pagination,
    });
  }
}
