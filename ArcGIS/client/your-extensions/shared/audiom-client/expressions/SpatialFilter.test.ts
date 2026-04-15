import { describe, it, expect } from 'vitest';
import {
  SpatialFilter,
  SpatialRelationship,
  GeometryType,
  DistanceUnit
} from './spatial/EsriSpatialFilter';
import type { EsriEnvelope, EsriPoint } from './spatial/EsriSpatialFilter';

describe('SpatialFilter', () => {
  describe('static builders', () => {
    it('intersects() creates correct filter', () => {
      const point: EsriPoint = { x: -122.4, y: 37.8 };
      const filter = SpatialFilter.intersects(point, GeometryType.Point);
      expect(filter.spatialRel).toBe(SpatialRelationship.Intersects);
      expect(filter.geometryType).toBe(GeometryType.Point);
      expect(filter.geometry).toBe(point);
    });

    it('contains() creates correct filter', () => {
      const env: EsriEnvelope = { xmin: -123, ymin: 37, xmax: -122, ymax: 38 };
      const filter = SpatialFilter.contains(env, GeometryType.Envelope);
      expect(filter.spatialRel).toBe(SpatialRelationship.Contains);
    });

    it('within() creates correct filter', () => {
      const env: EsriEnvelope = { xmin: -123, ymin: 37, xmax: -122, ymax: 38 };
      const filter = SpatialFilter.within(env, GeometryType.Envelope);
      expect(filter.spatialRel).toBe(SpatialRelationship.Within);
    });

    it('withinDistance() sets distance and units', () => {
      const point: EsriPoint = { x: -122.4, y: 37.8 };
      const filter = SpatialFilter.withinDistance(point, GeometryType.Point, 1000, DistanceUnit.Meter);
      expect(filter.distance).toBe(1000);
      expect(filter.units).toBe(DistanceUnit.Meter);
      expect(filter.spatialRel).toBe(SpatialRelationship.Intersects);
    });

    it('withinDistance() defaults to meters', () => {
      const point: EsriPoint = { x: 0, y: 0 };
      const filter = SpatialFilter.withinDistance(point, GeometryType.Point, 500);
      expect(filter.units).toBe(DistanceUnit.Meter);
    });

    it('fromEnvelope() creates envelope intersection filter', () => {
      const filter = SpatialFilter.fromEnvelope(-123, 37, -122, 38, 4326);
      expect(filter.geometryType).toBe(GeometryType.Envelope);
      expect(filter.spatialRel).toBe(SpatialRelationship.Intersects);
      const geom = filter.geometry as EsriEnvelope;
      expect(geom.xmin).toBe(-123);
      expect(geom.ymin).toBe(37);
      expect(geom.xmax).toBe(-122);
      expect(geom.ymax).toBe(38);
      expect(geom.spatialReference).toEqual({ wkid: 4326 });
    });

    it('fromEnvelope() without wkid omits spatialReference', () => {
      const filter = SpatialFilter.fromEnvelope(0, 0, 1, 1);
      const geom = filter.geometry as EsriEnvelope;
      expect(geom.spatialReference).toBeUndefined();
    });
  });

  describe('toQueryParams()', () => {
    it('includes required parameters', () => {
      const point: EsriPoint = { x: -122.4, y: 37.8 };
      const filter = SpatialFilter.intersects(point, GeometryType.Point);
      const params = filter.toQueryParams();

      expect(params['geometryType']).toBe('esriGeometryPoint');
      expect(params['spatialRel']).toBe('esriSpatialRelIntersects');
      expect(params['geometry']).toBe(JSON.stringify(point));
    });

    it('serializes string geometry as-is', () => {
      const filter = SpatialFilter.intersects('-122.4,37.8', GeometryType.Point);
      expect(filter.toQueryParams()['geometry']).toBe('-122.4,37.8');
    });

    it('includes distance and units when set', () => {
      const point: EsriPoint = { x: 0, y: 0 };
      const filter = SpatialFilter.withinDistance(point, GeometryType.Point, 500, DistanceUnit.Kilometer);
      const params = filter.toQueryParams();

      expect(params['distance']).toBe('500');
      expect(params['units']).toBe('esriSRUnit_Kilometer');
    });

    it('includes inSR when set as number', () => {
      const filter = new SpatialFilter({
        geometry: { x: 0, y: 0 },
        geometryType: GeometryType.Point,
        spatialRel: SpatialRelationship.Intersects,
        inSR: 4326
      });
      expect(filter.toQueryParams()['inSR']).toBe('4326');
    });

    it('includes inSR when set as object', () => {
      const filter = new SpatialFilter({
        geometry: { x: 0, y: 0 },
        geometryType: GeometryType.Point,
        spatialRel: SpatialRelationship.Intersects,
        inSR: { wkid: 4326 }
      });
      expect(filter.toQueryParams()['inSR']).toBe(JSON.stringify({ wkid: 4326 }));
    });
  });
});

describe('enum values', () => {
  it('SpatialRelationship has Esri enum values', () => {
    expect(SpatialRelationship.Intersects).toBe('esriSpatialRelIntersects');
    expect(SpatialRelationship.Within).toBe('esriSpatialRelWithin');
    expect(SpatialRelationship.Contains).toBe('esriSpatialRelContains');
  });

  it('GeometryType has Esri enum values', () => {
    expect(GeometryType.Point).toBe('esriGeometryPoint');
    expect(GeometryType.Polygon).toBe('esriGeometryPolygon');
    expect(GeometryType.Envelope).toBe('esriGeometryEnvelope');
  });

  it('DistanceUnit has Esri enum values', () => {
    expect(DistanceUnit.Meter).toBe('esriSRUnit_Meter');
    expect(DistanceUnit.Kilometer).toBe('esriSRUnit_Kilometer');
    expect(DistanceUnit.StatuteMile).toBe('esriSRUnit_StatuteMile');
  });
});
