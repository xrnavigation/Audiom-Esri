import { describe, it, expect } from 'vitest';
import { Coordinates } from './Coordinates';

describe('Coordinates', () => {
  describe('create', () => {
    it('creates coordinates with longitude and latitude', () => {
      const c = Coordinates.create(-122.4194, 37.7749);
      expect(c.longitude).toBe(-122.4194);
      expect(c.latitude).toBe(37.7749);
    });
  });

  describe('from', () => {
    it('creates coordinates from ICoordinates object', () => {
      const c = Coordinates.from({ longitude: 10, latitude: 20 });
      expect(c.longitude).toBe(10);
      expect(c.latitude).toBe(20);
    });
  });

  describe('fromArray', () => {
    it('creates coordinates from [longitude, latitude] array', () => {
      const c = Coordinates.fromArray([-73.9857, 40.7484]);
      expect(c.longitude).toBe(-73.9857);
      expect(c.latitude).toBe(40.7484);
    });

    it('accepts arrays with more than 2 elements (uses first two)', () => {
      const c = Coordinates.fromArray([1, 2, 3]);
      expect(c.longitude).toBe(1);
      expect(c.latitude).toBe(2);
    });

    it('throws for arrays with fewer than 2 elements', () => {
      expect(() => Coordinates.fromArray([1])).toThrow('at least 2 elements');
      expect(() => Coordinates.fromArray([])).toThrow('at least 2 elements');
    });
  });

  describe('parse', () => {
    it('parses "longitude,latitude" string', () => {
      const c = Coordinates.parse('-122.4194,37.7749');
      expect(c.longitude).toBe(-122.4194);
      expect(c.latitude).toBe(37.7749);
    });

    it('handles whitespace around values', () => {
      const c = Coordinates.parse(' -122.4194 , 37.7749 ');
      expect(c.longitude).toBe(-122.4194);
      expect(c.latitude).toBe(37.7749);
    });

    it('throws for wrong number of parts', () => {
      expect(() => Coordinates.parse('1,2,3')).toThrow('Invalid coordinates format');
      expect(() => Coordinates.parse('1')).toThrow('Invalid coordinates format');
    });

    it('throws for non-numeric values', () => {
      expect(() => Coordinates.parse('abc,def')).toThrow('Values must be numeric');
    });
  });

  describe('toArray', () => {
    it('returns [longitude, latitude] tuple', () => {
      const c = Coordinates.create(10, 20);
      expect(c.toArray()).toEqual([10, 20]);
    });
  });

  describe('toString', () => {
    it('returns "longitude,latitude" string', () => {
      const c = Coordinates.create(-122.4194, 37.7749);
      expect(c.toString()).toBe('-122.4194,37.7749');
    });
  });

  describe('equals', () => {
    it('returns true for equal coordinates', () => {
      const a = Coordinates.create(10, 20);
      const b = Coordinates.create(10, 20);
      expect(a.equals(b)).toBe(true);
    });

    it('returns false when longitude differs', () => {
      const a = Coordinates.create(10, 20);
      const b = Coordinates.create(11, 20);
      expect(a.equals(b)).toBe(false);
    });

    it('returns false when latitude differs', () => {
      const a = Coordinates.create(10, 20);
      const b = Coordinates.create(10, 21);
      expect(a.equals(b)).toBe(false);
    });
  });
});
