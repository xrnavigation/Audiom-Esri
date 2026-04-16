/**
 * Source-type-aware query parameter serialization.
 *
 * Each source type (Esri, OGC/TDEI, OSM/Overpass, GeoJSON) has different
 * parameter formats. This module provides strategy functions that take
 * a common set of query options and produce source-type-specific parameter
 * objects.
 */

import { Expression } from './Expression';
import { toEsriSql } from './serializers/EsriSqlSerializer';
import { toCql2Text } from './serializers/Cql2Serializer';
import { toOverpassFilters } from './serializers/OverpassTagSerializer';
import { SpatialFilter } from './spatial/EsriSpatialFilter';
import { TimeInstant, TimeExtent } from './temporal/EsriTemporalFilter';
import { OrderByField, PaginationOptions, SortOrder, orderByFieldsToString } from './QueryOptions';
import type { BoundingBox } from './spatial/BoundingBox';
import { toOgcBboxParam, toOverpassBboxFilter } from './spatial/BoundingBox';
import { DateTimeInstant, DateTimeInterval } from './temporal/DateTimeFilter';
import type { OverpassAroundFilter } from './spatial/OverpassSpatialFilter';

// ── Overpass element types ──────────────────────────────────────────

export enum OverpassElementType {
  Node = 'node',
  Way = 'way',
  Relation = 'relation',
  /** node, way, relation — query all element types */
  Nwr = 'nwr',
}

// ── Overpass Output Options ─────────────────────────────────────────

export interface OverpassOutputOptions {
  /** Output format. Defaults to `json`. */
  format?: 'json' | 'xml' | 'csv';
  /** Query timeout in seconds. Defaults to 25. */
  timeout?: number;
  /** Element type to query. Defaults to `nwr`. */
  elementType?: OverpassElementType;
  /** Max number of results. If set, appended as a limit in the out statement. */
  maxResults?: number;
}

// ── Esri parameter serialization ────────────────────────────────────

export interface EsriParamOptions {
  where?: Expression;
  spatialFilter?: SpatialFilter;
  time?: TimeInstant | TimeExtent;
  outFields?: string[];
  orderByFields?: OrderByField[];
  pagination?: PaginationOptions;
}

/**
 * Serialize query options to Esri REST API query parameters.
 */
export function toEsriParams(options: EsriParamOptions): Record<string, string> {
  const params: Record<string, string> = {};

  if (options.where) {
    params['where'] = toEsriSql(options.where);
  }

  if (options.spatialFilter) {
    const spatialParams = options.spatialFilter.toQueryParams();
    Object.entries(spatialParams).forEach(([key, value]) => {
      params[key] = value;
    });
  }

  if (options.time) {
    params['time'] = options.time.toQueryParam();
  }

  if (options.outFields && options.outFields.length > 0) {
    params['outFields'] = options.outFields.join(',');
  }

  if (options.orderByFields && options.orderByFields.length > 0) {
    params['orderByFields'] = orderByFieldsToString(options.orderByFields);
  }

  if (options.pagination) {
    params['resultRecordCount'] = String(options.pagination.count);
    if (options.pagination.offset !== undefined) {
      params['resultOffset'] = String(options.pagination.offset);
    }
  }

  return params;
}

// ── OGC API Features parameter serialization ────────────────────────

export interface OgcParamOptions {
  where?: Expression;
  bbox?: BoundingBox;
  datetime?: DateTimeInstant | DateTimeInterval;
  outFields?: string[];
  orderByFields?: OrderByField[];
  pagination?: PaginationOptions;
}

/**
 * Serialize query options to OGC API Features parameters.
 *
 * @see https://docs.ogc.org/is/17-069r4/17-069r4.html
 */
export function toOgcParams(options: OgcParamOptions): Record<string, string> {
  const params: Record<string, string> = {};

  if (options.where) {
    params['filter'] = toCql2Text(options.where);
    params['filter-lang'] = 'cql2-text';
  }

  if (options.bbox) {
    params['bbox'] = toOgcBboxParam(options.bbox);
  }

  if (options.datetime) {
    if (options.datetime instanceof DateTimeInstant) {
      params['datetime'] = options.datetime.toRfc3339();
    } else {
      params['datetime'] = options.datetime.toOgcDateTimeParam();
    }
  }

  if (options.outFields && options.outFields.length > 0) {
    params['properties'] = options.outFields.join(',');
  }

  if (options.orderByFields && options.orderByFields.length > 0) {
    // OGC sortby: +field (asc) or -field (desc)
    params['sortby'] = options.orderByFields
      .map(entry => {
        const prefix = entry.order === SortOrder.Descending ? '-' : '+';
        return `${prefix}${entry.field}`;
      })
      .join(',');
  }

  if (options.pagination) {
    params['limit'] = String(options.pagination.count);
    if (options.pagination.offset !== undefined) {
      params['offset'] = String(options.pagination.offset);
    }
  }

  return params;
}

// ── Overpass QL query body serialization ─────────────────────────────

export interface OverpassQueryOptions {
  where?: Expression;
  bbox?: BoundingBox;
  aroundFilter?: OverpassAroundFilter;
  datetime?: DateTimeInstant;
  outputOptions?: OverpassOutputOptions;
}

/**
 * Assemble a complete Overpass QL query body.
 *
 * At least one filter (`where`, `bbox`, or `aroundFilter`) must be provided.
 * An unfiltered query would attempt to download the entire OSM planet.
 *
 * @throws {Error} if no attribute, spatial, or around filter is provided.
 * @see https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL
 */
export function toOverpassQuery(options: OverpassQueryOptions): string {
  if (!options.where && !options.bbox && !options.aroundFilter) {
    throw new Error(
      'toOverpassQuery() requires at least one filter (where, bbox, or aroundFilter). '
      + 'An unfiltered query would request all OSM elements globally.'
    );
  }

  const format = options.outputOptions?.format ?? 'json';
  const timeout = options.outputOptions?.timeout ?? 25;
  const elementType = options.outputOptions?.elementType ?? OverpassElementType.Nwr;
  const maxResults = options.outputOptions?.maxResults;

  const parts: string[] = [];

  // Settings
  parts.push(`[out:${format}][timeout:${timeout}]`);

  // Date setting
  if (options.datetime) {
    parts.push(options.datetime.toOverpassDateSetting());
  }

  parts.push(';');

  // Query statement
  let statement = elementType as string;

  // Tag filters
  if (options.where) {
    statement += toOverpassFilters(options.where);
  }

  // Spatial filter: bbox or around
  if (options.bbox) {
    statement += toOverpassBboxFilter(options.bbox);
  } else if (options.aroundFilter) {
    statement += options.aroundFilter.toOverpassFilter();
  }

  parts.push(`${statement};`);

  // Output
  const outLimit = maxResults !== undefined ? ` ${maxResults}` : '';
  parts.push(`out body geom${outLimit};`);

  return parts.join('');
}
