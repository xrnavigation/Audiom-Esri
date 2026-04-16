import { describe, it, expect } from 'vitest';
import { OverpassAroundFilter } from './OverpassSpatialFilter';

describe('OverpassAroundFilter', () => {
  describe('aroundPoint', () => {
    it('creates a filter around a specific point', () => {
      const filter = OverpassAroundFilter.aroundPoint(100, 50.7, 7.1);
      expect(filter.radius).toBe(100);
      expect(filter.lat).toBe(50.7);
      expect(filter.lon).toBe(7.1);
    });

    it('serializes to (around:radius,lat,lon)', () => {
      const filter = OverpassAroundFilter.aroundPoint(100, 50.7, 7.1);
      expect(filter.toOverpassFilter()).toBe('(around:100,50.7,7.1)');
    });

    it('handles large radius values', () => {
      const filter = OverpassAroundFilter.aroundPoint(50000, 48.8566, 2.3522);
      expect(filter.toOverpassFilter()).toBe('(around:50000,48.8566,2.3522)');
    });
  });

  describe('aroundSet', () => {
    it('creates a filter around the input set', () => {
      const filter = OverpassAroundFilter.aroundSet(200);
      expect(filter.radius).toBe(200);
      expect(filter.lat).toBeUndefined();
      expect(filter.lon).toBeUndefined();
    });

    it('serializes to (around:radius) without coordinates', () => {
      const filter = OverpassAroundFilter.aroundSet(200);
      expect(filter.toOverpassFilter()).toBe('(around:200)');
    });
  });
});
