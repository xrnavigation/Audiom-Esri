import { describe, it, expect } from 'vitest';
import { AudiomSource, SourceType, MapType } from './AudiomSource';
import { field } from './expressions/AttributeFilter';
import { orderBy, SortOrder } from './expressions/QueryOptions';
import { bbox } from './expressions/spatial/BoundingBox';
import { DateTimeInstant, DateTimeInterval } from './expressions/temporal/DateTimeFilter';
import { OverpassAroundFilter } from './expressions/spatial/OverpassSpatialFilter';
import { OverpassElementType } from './expressions/SourceTypeSerializer';

describe('AudiomSource', () => {
  describe('constructor', () => {
    it('assigns all config properties', () => {
      const whereExpr = field('type').eq('building');
      const src = new AudiomSource({
        source: 'mySource',
        type: SourceType.ESRI,
        mapType: MapType.Indoor,
        name: 'My Source',
        url: 'https://example.com/service',
        rules: '/rules.json',
        where: whereExpr,
        additionalParams: { foo: 'bar' }
      });

      expect(src.source).toBe('mySource');
      expect(src.type).toBe(SourceType.ESRI);
      expect(src.mapType).toBe(MapType.Indoor);
      expect(src.name).toBe('My Source');
      expect(src.url).toBe('https://example.com/service');
      expect(src.rules).toBe('/rules.json');
      expect(src.where).toBe(whereExpr);
      expect(src.additionalParams).toEqual({ foo: 'bar' });
    });

    it('leaves optional properties undefined when not provided', () => {
      const src = new AudiomSource({ source: 'osm' });
      expect(src.source).toBe('osm');
      expect(src.type).toBeUndefined();
      expect(src.mapType).toBeUndefined();
      expect(src.name).toBeUndefined();
      expect(src.url).toBeUndefined();
      expect(src.rules).toBeUndefined();
      expect(src.where).toBeUndefined();
      expect(src.additionalParams).toBeUndefined();
    });
  });

  describe('fromName', () => {
    it('creates a source with just a name', () => {
      const src = AudiomSource.fromName('osm');
      expect(src.source).toBe('osm');
      expect(src.type).toBeUndefined();
    });
  });

  describe('fromGeoJsonUrl', () => {
    it('creates a GeoJSON source from URL', () => {
      const src = AudiomSource.fromGeoJsonUrl('https://example.com/data.geojson');
      expect(src.source).toBe('https://example.com/data.geojson');
      expect(src.type).toBe(SourceType.GeoJSON);
      expect(src.name).toBeUndefined();
    });

    it('accepts an optional display name', () => {
      const src = AudiomSource.fromGeoJsonUrl('https://example.com/data.geojson', 'My GeoJSON');
      expect(src.name).toBe('My GeoJSON');
    });
  });

  describe('fromEsri', () => {
    it('creates an ESRI source', () => {
      const whereExpr = field('type').eq('commercial');
      const src = AudiomSource.fromEsri({
        source: 'buildings',
        url: 'https://services.arcgis.com/layer',
        name: 'Buildings',
        mapType: MapType.Indoor,
        rules: '/rules.json',
        where: whereExpr
      });

      expect(src.source).toBe('buildings');
      expect(src.type).toBe(SourceType.ESRI);
      expect(src.url).toBe('https://services.arcgis.com/layer');
      expect(src.name).toBe('Buildings');
      expect(src.mapType).toBe(MapType.Indoor);
      expect(src.rules).toBe('/rules.json');
      expect(src.where).toBe(whereExpr);
    });

    it('works with only required fields', () => {
      const src = AudiomSource.fromEsri({ source: 'layer1', url: 'https://example.com' });
      expect(src.type).toBe(SourceType.ESRI);
      expect(src.name).toBeUndefined();
    });
  });

  describe('toQueryParams', () => {
    it('returns empty object for a source with no optional params', () => {
      const src = AudiomSource.fromName('osm');
      expect(src.toQueryParams()).toEqual({});
    });

    it('namespaces all parameters with the source name', () => {
      const src = new AudiomSource({
        source: 'mySource',
        type: SourceType.GeoJSON,
        mapType: MapType.Travel,
        name: 'Display Name',
        url: 'https://example.com/data',
        rules: '/rules.json',
        where: field('status').eq('active')
      });

      const params = src.toQueryParams();
      expect(params['mySource.type']).toBe('geojson');
      expect(params['mySource.mapType']).toBe('travel');
      expect(params['mySource.name']).toBe('Display Name');
      expect(params['mySource.url']).toBe('https://example.com/data');
      expect(params['mySource.rules']).toBe('/rules.json');
      expect(params['mySource.where']).toBe("status = 'active'");
    });

    it('includes additionalParams with namespaced keys', () => {
      const src = new AudiomSource({
        source: 'src',
        additionalParams: { custom: 'value', count: 5, enabled: true }
      });

      const params = src.toQueryParams();
      expect(params['src.custom']).toBe('value');
      expect(params['src.count']).toBe('5');
      expect(params['src.enabled']).toBe('true');
    });

    it('serializes outFields as comma-separated list', () => {
      const src = new AudiomSource({
        source: 'layer',
        outFields: ['name', 'population', 'state']
      });
      const params = src.toQueryParams();
      expect(params['layer.outFields']).toBe('name,population,state');
    });

    it('serializes wildcard outFields', () => {
      const src = new AudiomSource({
        source: 'layer',
        outFields: ['*']
      });
      const params = src.toQueryParams();
      expect(params['layer.outFields']).toBe('*');
    });

    it('omits outFields when empty array', () => {
      const src = new AudiomSource({
        source: 'layer',
        outFields: []
      });
      const params = src.toQueryParams();
      expect(params['layer.outFields']).toBeUndefined();
    });

    it('serializes orderByFields with sort direction', () => {
      const src = new AudiomSource({
        source: 'layer',
        orderByFields: [
          orderBy('name'),
          orderBy('population', SortOrder.Descending)
        ]
      });
      const params = src.toQueryParams();
      expect(params['layer.orderByFields']).toBe('name ASC, population DESC');
    });

    it('serializes pagination with count only', () => {
      const src = new AudiomSource({
        source: 'layer',
        pagination: { count: 50 }
      });
      const params = src.toQueryParams();
      expect(params['layer.resultRecordCount']).toBe('50');
      expect(params['layer.resultOffset']).toBeUndefined();
    });

    it('serializes pagination with count and offset', () => {
      const src = new AudiomSource({
        source: 'layer',
        pagination: { count: 25, offset: 100 }
      });
      const params = src.toQueryParams();
      expect(params['layer.resultRecordCount']).toBe('25');
      expect(params['layer.resultOffset']).toBe('100');
    });
  });

  describe('fromOgc', () => {
    it('creates a TDEI/OGC source', () => {
      const src = AudiomSource.fromOgc({
        source: 'sidewalks',
        url: 'https://tdei.example.com/collections/sidewalks/items',
        name: 'Sidewalks',
      });
      expect(src.type).toBe(SourceType.TDEI);
      expect(src.url).toBe('https://tdei.example.com/collections/sidewalks/items');
      expect(src.name).toBe('Sidewalks');
    });

    it('serializes OGC params with CQL2 filter', () => {
      const src = AudiomSource.fromOgc({
        source: 'sidewalks',
        url: 'https://tdei.example.com',
        where: field('surface').eq('concrete'),
      });
      const params = src.toQueryParams();
      expect(params['sidewalks.filter']).toBe("surface = 'concrete'");
      expect(params['sidewalks.filter-lang']).toBe('cql2-text');
    });

    it('serializes OGC bbox param', () => {
      const src = AudiomSource.fromOgc({
        source: 'sidewalks',
        url: 'https://tdei.example.com',
        bbox: bbox(-122.5, 37.5, -122.0, 38.0),
      });
      const params = src.toQueryParams();
      expect(params['sidewalks.bbox']).toBe('-122.5,37.5,-122,38');
    });

    it('serializes OGC datetime instant', () => {
      const src = AudiomSource.fromOgc({
        source: 'sidewalks',
        url: 'https://tdei.example.com',
        datetime: DateTimeInstant.fromDate(new Date(Date.UTC(2024, 0, 15))),
      });
      const params = src.toQueryParams();
      expect(params['sidewalks.datetime']).toBe('2024-01-15T00:00:00Z');
    });

    it('serializes OGC datetime interval', () => {
      const src = AudiomSource.fromOgc({
        source: 'sidewalks',
        url: 'https://tdei.example.com',
        datetime: DateTimeInterval.create(
          new Date(Date.UTC(2024, 0, 1)),
          new Date(Date.UTC(2024, 5, 30))
        ),
      });
      const params = src.toQueryParams();
      expect(params['sidewalks.datetime']).toBe('2024-01-01T00:00:00Z/2024-06-30T00:00:00Z');
    });

    it('serializes OGC pagination as limit/offset', () => {
      const src = AudiomSource.fromOgc({
        source: 'sidewalks',
        url: 'https://tdei.example.com',
        pagination: { count: 50, offset: 100 },
      });
      const params = src.toQueryParams();
      expect(params['sidewalks.limit']).toBe('50');
      expect(params['sidewalks.offset']).toBe('100');
    });

    it('serializes OGC sortby with +/- prefix', () => {
      const src = AudiomSource.fromOgc({
        source: 'sidewalks',
        url: 'https://tdei.example.com',
        orderByFields: [orderBy('name'), orderBy('length', SortOrder.Descending)],
      });
      const params = src.toQueryParams();
      expect(params['sidewalks.sortby']).toBe('+name,-length');
    });

    it('serializes OGC outFields as properties', () => {
      const src = AudiomSource.fromOgc({
        source: 'sidewalks',
        url: 'https://tdei.example.com',
        outFields: ['name', 'surface'],
      });
      const params = src.toQueryParams();
      expect(params['sidewalks.properties']).toBe('name,surface');
    });
  });

  describe('fromOverpass', () => {
    it('creates an OSM/Overpass source', () => {
      const src = AudiomSource.fromOverpass({
        source: 'footways',
        name: 'Footways',
      });
      expect(src.type).toBe(SourceType.OSM);
      expect(src.name).toBe('Footways');
    });

    it('serializes Overpass QL query with tag filters', () => {
      const src = AudiomSource.fromOverpass({
        source: 'footways',
        where: field('highway').eq('footway'),
      });
      const params = src.toQueryParams();
      expect(params['footways.data']).toBe(
        '[out:json][timeout:25];nwr["highway"="footway"];out body geom;'
      );
    });

    it('serializes Overpass QL with bbox', () => {
      const src = AudiomSource.fromOverpass({
        source: 'footways',
        where: field('highway').eq('footway'),
        bbox: bbox(7, 50, 8, 51),
      });
      const params = src.toQueryParams();
      expect(params['footways.data']).toBe(
        '[out:json][timeout:25];nwr["highway"="footway"](50,7,51,8);out body geom;'
      );
    });

    it('serializes Overpass QL with around filter', () => {
      const src = AudiomSource.fromOverpass({
        source: 'footways',
        where: field('highway').eq('footway'),
        aroundFilter: OverpassAroundFilter.aroundPoint(500, 48.8566, 2.3522),
      });
      const params = src.toQueryParams();
      expect(params['footways.data']).toBe(
        '[out:json][timeout:25];nwr["highway"="footway"](around:500,48.8566,2.3522);out body geom;'
      );
    });

    it('serializes Overpass QL with date setting', () => {
      const src = AudiomSource.fromOverpass({
        source: 'footways',
        where: field('highway').eq('footway'),
        datetime: DateTimeInstant.fromDate(new Date(Date.UTC(2024, 0, 15))),
      });
      const params = src.toQueryParams();
      expect(params['footways.data']).toContain('[date:"2024-01-15T00:00:00Z"]');
    });

    it('serializes Overpass QL with custom output options', () => {
      const src = AudiomSource.fromOverpass({
        source: 'footways',
        where: field('highway').eq('footway'),
        overpassOptions: {
          timeout: 60,
          elementType: OverpassElementType.Way,
          maxResults: 100,
        },
      });
      const params = src.toQueryParams();
      expect(params['footways.data']).toBe(
        '[out:json][timeout:60];way["highway"="footway"];out body geom 100;'
      );
    });

    it('returns no data param when no query options are set', () => {
      const src = AudiomSource.fromOverpass({
        source: 'footways',
      });
      const params = src.toQueryParams();
      expect(params['footways.data']).toBeUndefined();
    });
  });
});

// ── Enum values ─────────────────────────────────────────────────────

describe('MapType', () => {
  it('has expected string values', () => {
    expect(MapType.Travel).toBe('travel');
    expect(MapType.Heatmap).toBe('heatmap');
    expect(MapType.Indoor).toBe('indoor');
  });
});

describe('SourceType', () => {
  it('has expected string values', () => {
    expect(SourceType.OSM).toBe('osm');
    expect(SourceType.TDEI).toBe('TDEI');
    expect(SourceType.ESRI).toBe('esri');
    expect(SourceType.GeoJSON).toBe('geojson');
  });
});
