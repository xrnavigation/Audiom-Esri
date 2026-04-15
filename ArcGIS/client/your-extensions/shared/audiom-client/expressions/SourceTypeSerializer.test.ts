import { describe, it, expect } from 'vitest';
import {
  toEsriParams,
  toOgcParams,
  toOverpassQuery,
  OverpassElementType,
} from './SourceTypeSerializer';
import { field, and } from './AttributeFilter';
import { SpatialFilter, GeometryType } from './spatial/EsriSpatialFilter';
import { TimeInstant, TimeExtent } from './temporal/EsriTemporalFilter';
import { orderBy, SortOrder } from './QueryOptions';
import { bbox } from './spatial/BoundingBox';
import { DateTimeInstant, DateTimeInterval } from './temporal/DateTimeFilter';
import { OverpassAroundFilter } from './spatial/OverpassSpatialFilter';

// ── Esri params ─────────────────────────────────────────────────────

describe('toEsriParams', () => {
  it('returns empty object when no options set', () => {
    expect(toEsriParams({})).toEqual({});
  });

  it('serializes where clause as Esri SQL', () => {
    const params = toEsriParams({
      where: field('status').eq('active'),
    });
    expect(params['where']).toBe("status = 'active'");
  });

  it('serializes boolean as 1/0 in Esri SQL', () => {
    const params = toEsriParams({
      where: field('active').eq(true),
    });
    expect(params['where']).toBe('active = 1');
  });

  it('serializes spatialFilter', () => {
    const params = toEsriParams({
      spatialFilter: SpatialFilter.fromEnvelope(-122, 37, -121, 38),
    });
    expect(params['geometryType']).toBe(GeometryType.Envelope);
    expect(params['geometry']).toBeDefined();
  });

  it('serializes time instant', () => {
    const params = toEsriParams({
      time: TimeInstant.fromEpochMs(1000000),
    });
    expect(params['time']).toBe('1000000');
  });

  it('serializes time extent', () => {
    const params = toEsriParams({
      time: TimeExtent.fromEpochMs(1000, 2000),
    });
    expect(params['time']).toBe('1000,2000');
  });

  it('serializes outFields', () => {
    const params = toEsriParams({
      outFields: ['name', 'pop'],
    });
    expect(params['outFields']).toBe('name,pop');
  });

  it('serializes orderByFields', () => {
    const params = toEsriParams({
      orderByFields: [orderBy('name'), orderBy('pop', SortOrder.Descending)],
    });
    expect(params['orderByFields']).toBe('name ASC, pop DESC');
  });

  it('serializes pagination', () => {
    const params = toEsriParams({
      pagination: { count: 50, offset: 100 },
    });
    expect(params['resultRecordCount']).toBe('50');
    expect(params['resultOffset']).toBe('100');
  });

  it('omits resultOffset when not provided', () => {
    const params = toEsriParams({
      pagination: { count: 50 },
    });
    expect(params['resultRecordCount']).toBe('50');
    expect(params['resultOffset']).toBeUndefined();
  });
});

// ── OGC params ──────────────────────────────────────────────────────

describe('toOgcParams', () => {
  it('returns empty object when no options set', () => {
    expect(toOgcParams({})).toEqual({});
  });

  it('serializes where clause as CQL2-Text with filter-lang', () => {
    const params = toOgcParams({
      where: field('status').eq('active'),
    });
    expect(params['filter']).toBe("status = 'active'");
    expect(params['filter-lang']).toBe('cql2-text');
  });

  it('serializes boolean as TRUE/FALSE in CQL2', () => {
    const params = toOgcParams({
      where: field('active').eq(true),
    });
    expect(params['filter']).toBe('active = TRUE');
  });

  it('serializes bbox', () => {
    const params = toOgcParams({
      bbox: bbox(-122.5, 37.5, -122.0, 38.0),
    });
    expect(params['bbox']).toBe('-122.5,37.5,-122,38');
  });

  it('serializes datetime instant', () => {
    const params = toOgcParams({
      datetime: DateTimeInstant.fromDate(new Date(Date.UTC(2024, 0, 15, 10, 30, 0))),
    });
    expect(params['datetime']).toBe('2024-01-15T10:30:00Z');
  });

  it('serializes datetime interval', () => {
    const params = toOgcParams({
      datetime: DateTimeInterval.create(
        new Date(Date.UTC(2024, 0, 1)),
        new Date(Date.UTC(2024, 5, 30))
      ),
    });
    expect(params['datetime']).toBe('2024-01-01T00:00:00Z/2024-06-30T00:00:00Z');
  });

  it('serializes open-start interval', () => {
    const params = toOgcParams({
      datetime: DateTimeInterval.create(null, new Date(Date.UTC(2024, 5, 30))),
    });
    expect(params['datetime']).toBe('../2024-06-30T00:00:00Z');
  });

  it('serializes outFields as properties', () => {
    const params = toOgcParams({
      outFields: ['name', 'pop'],
    });
    expect(params['properties']).toBe('name,pop');
  });

  it('serializes orderByFields as sortby with +/-', () => {
    const params = toOgcParams({
      orderByFields: [orderBy('name'), orderBy('pop', SortOrder.Descending)],
    });
    expect(params['sortby']).toBe('+name,-pop');
  });

  it('serializes pagination as limit/offset', () => {
    const params = toOgcParams({
      pagination: { count: 50, offset: 100 },
    });
    expect(params['limit']).toBe('50');
    expect(params['offset']).toBe('100');
  });

  it('omits offset when not provided', () => {
    const params = toOgcParams({
      pagination: { count: 50 },
    });
    expect(params['limit']).toBe('50');
    expect(params['offset']).toBeUndefined();
  });
});

// ── Overpass query ──────────────────────────────────────────────────

describe('toOverpassQuery', () => {
  it('throws when no filter is provided', () => {
    expect(() => toOverpassQuery({})).toThrow(
      'toOverpassQuery() requires at least one filter'
    );
  });

  it('includes tag filters from where expression', () => {
    const query = toOverpassQuery({
      where: field('highway').eq('footway'),
    });
    expect(query).toBe(
      '[out:json][timeout:25];nwr["highway"="footway"];out body geom;'
    );
  });

  it('includes multiple tag filters from AND expression', () => {
    const query = toOverpassQuery({
      where: and(
        field('highway').eq('footway'),
        field('surface').eq('asphalt')
      ),
    });
    expect(query).toBe(
      '[out:json][timeout:25];nwr["highway"="footway"]["surface"="asphalt"];out body geom;'
    );
  });

  it('includes bbox filter', () => {
    const query = toOverpassQuery({
      bbox: bbox(7, 50, 8, 51),
    });
    expect(query).toBe(
      '[out:json][timeout:25];nwr(50,7,51,8);out body geom;'
    );
  });

  it('includes around filter', () => {
    const query = toOverpassQuery({
      aroundFilter: OverpassAroundFilter.aroundPoint(100, 50.7, 7.1),
    });
    expect(query).toBe(
      '[out:json][timeout:25];nwr(around:100,50.7,7.1);out body geom;'
    );
  });

  it('prefers bbox over around filter when both provided', () => {
    const query = toOverpassQuery({
      bbox: bbox(7, 50, 8, 51),
      aroundFilter: OverpassAroundFilter.aroundPoint(100, 50.7, 7.1),
    });
    expect(query).toContain('(50,7,51,8)');
    expect(query).not.toContain('around');
  });

  it('includes date setting', () => {
    const query = toOverpassQuery({
      where: field('highway').eq('footway'),
      datetime: DateTimeInstant.fromDate(new Date(Date.UTC(2024, 0, 15))),
    });
    expect(query).toBe(
      '[out:json][timeout:25][date:"2024-01-15T00:00:00Z"];nwr["highway"="footway"];out body geom;'
    );
  });

  it('respects custom output options', () => {
    const query = toOverpassQuery({
      where: field('highway').eq('footway'),
      outputOptions: {
        format: 'xml',
        timeout: 60,
        elementType: OverpassElementType.Way,
        maxResults: 100,
      },
    });
    expect(query).toBe(
      '[out:xml][timeout:60];way["highway"="footway"];out body geom 100;'
    );
  });

  it('combines tag filters, bbox, and date', () => {
    const query = toOverpassQuery({
      where: field('highway').eq('footway'),
      bbox: bbox(7, 50, 8, 51),
      datetime: DateTimeInstant.fromDate(new Date(Date.UTC(2024, 0, 15))),
    });
    expect(query).toBe(
      '[out:json][timeout:25][date:"2024-01-15T00:00:00Z"];nwr["highway"="footway"](50,7,51,8);out body geom;'
    );
  });
});
