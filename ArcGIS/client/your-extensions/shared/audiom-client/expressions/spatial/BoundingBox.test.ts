import { describe, it, expect } from 'vitest';
import { bbox, toOgcBboxParam, toOverpassBboxFilter, toEsriEnvelope } from './BoundingBox';
import type { BoundingBox } from './BoundingBox';

describe('BoundingBox', () => {
  const testBox: BoundingBox = bbox(-122.5, 37.5, -122.0, 38.0);

  describe('bbox factory', () => {
    it('creates a BoundingBox with correct coordinates', () => {
      expect(testBox).toEqual({
        west: -122.5,
        south: 37.5,
        east: -122.0,
        north: 38.0,
      });
    });
  });

  describe('toOgcBboxParam', () => {
    it('formats as west,south,east,north', () => {
      expect(toOgcBboxParam(testBox)).toBe('-122.5,37.5,-122,38');
    });

    it('handles integer coordinates', () => {
      expect(toOgcBboxParam(bbox(7, 50, 8, 51))).toBe('7,50,8,51');
    });

    it('handles negative coordinates', () => {
      expect(toOgcBboxParam(bbox(-180, -90, 180, 90))).toBe('-180,-90,180,90');
    });
  });

  describe('toOverpassBboxFilter', () => {
    it('formats as (south,west,north,east) — different order than OGC', () => {
      expect(toOverpassBboxFilter(testBox)).toBe('(37.5,-122.5,38,-122)');
    });

    it('handles integer coordinates', () => {
      expect(toOverpassBboxFilter(bbox(7, 50, 8, 51))).toBe('(50,7,51,8)');
    });
  });

  describe('toEsriEnvelope', () => {
    it('converts to Esri envelope format', () => {
      expect(toEsriEnvelope(testBox)).toEqual({
        xmin: -122.5,
        ymin: 37.5,
        xmax: -122.0,
        ymax: 38.0,
      });
    });

    it('includes spatial reference when wkid is provided', () => {
      expect(toEsriEnvelope(testBox, 4326)).toEqual({
        xmin: -122.5,
        ymin: 37.5,
        xmax: -122.0,
        ymax: 38.0,
        spatialReference: { wkid: 4326 },
      });
    });

    it('omits spatial reference when wkid is not provided', () => {
      const result = toEsriEnvelope(testBox);
      expect(result.spatialReference).toBeUndefined();
    });
  });
});
