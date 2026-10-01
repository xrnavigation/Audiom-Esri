import { describe, it, expect } from 'vitest';
import { GeoQuad } from './GeoQuad';
import { Coordinates } from './Coordinates';

function makeQuad() {
  return new GeoQuad(
    Coordinates.create(-10, 10),   // topLeft
    Coordinates.create(10, 10),    // topRight
    Coordinates.create(10, -10),   // bottomRight
    Coordinates.create(-10, -10)   // bottomLeft
  );
}

describe('GeoQuad', () => {
  describe('constructor', () => {
    it('assigns corner coordinates', () => {
      const q = makeQuad();
      expect(q.topLeft.toArray()).toEqual([-10, 10]);
      expect(q.topRight.toArray()).toEqual([10, 10]);
      expect(q.bottomRight.toArray()).toEqual([10, -10]);
      expect(q.bottomLeft.toArray()).toEqual([-10, -10]);
    });
  });

  describe('from', () => {
    it('creates a GeoQuad from IGeoQuad', () => {
      const q = GeoQuad.from({
        topLeft: { longitude: -1, latitude: 1 },
        topRight: { longitude: 1, latitude: 1 },
        bottomRight: { longitude: 1, latitude: -1 },
        bottomLeft: { longitude: -1, latitude: -1 }
      });
      expect(q.topLeft.longitude).toBe(-1);
      expect(q.bottomRight.latitude).toBe(-1);
    });
  });

  describe('fromArray', () => {
    it('creates a GeoQuad from number[][]', () => {
      const q = GeoQuad.fromArray([[-10, 10], [10, 10], [10, -10], [-10, -10]]);
      expect(q.topLeft.toArray()).toEqual([-10, 10]);
      expect(q.bottomLeft.toArray()).toEqual([-10, -10]);
    });

    it('throws if not exactly 4 coordinates', () => {
      expect(() => GeoQuad.fromArray([[0, 0], [1, 1]])).toThrow('exactly 4 coordinates');
      expect(() => GeoQuad.fromArray([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]])).toThrow('exactly 4 coordinates');
    });
  });

  describe('parse', () => {
    it('parses a JSON string of 4 coordinate pairs', () => {
      const json = '[[-10,10],[10,10],[10,-10],[-10,-10]]';
      const q = GeoQuad.parse(json);
      expect(q.topLeft.toArray()).toEqual([-10, 10]);
      expect(q.bottomRight.toArray()).toEqual([10, -10]);
    });

    it('handles whitespace around input', () => {
      const json = '  [[-1,1],[1,1],[1,-1],[-1,-1]]  ';
      const q = GeoQuad.parse(json);
      expect(q.topLeft.longitude).toBe(-1);
    });

    it('throws for invalid JSON', () => {
      expect(() => GeoQuad.parse('not json')).toThrow('Invalid GeoQuad format');
    });

    it('throws for valid JSON but wrong length', () => {
      expect(() => GeoQuad.parse('[[0,0],[1,1]]')).toThrow('Expected an array of 4 coordinate pairs');
    });
  });

  describe('toArray', () => {
    it('returns number[][] in order: TL, TR, BR, BL', () => {
      const q = makeQuad();
      expect(q.toArray()).toEqual([
        [-10, 10], [10, 10], [10, -10], [-10, -10]
      ]);
    });
  });

  describe('toString', () => {
    it('returns JSON string of the array representation', () => {
      const q = makeQuad();
      expect(q.toString()).toBe('[[-10,10],[10,10],[10,-10],[-10,-10]]');
    });
  });

  describe('getCoordinates', () => {
    it('returns a 4-element tuple of Coordinates', () => {
      const q = makeQuad();
      const [tl, tr, br, bl] = q.getCoordinates();
      expect(tl).toBe(q.topLeft);
      expect(tr).toBe(q.topRight);
      expect(br).toBe(q.bottomRight);
      expect(bl).toBe(q.bottomLeft);
    });
  });

  describe('equals', () => {
    it('returns true for equal quads', () => {
      const a = makeQuad();
      const b = makeQuad();
      expect(a.equals(b)).toBe(true);
    });

    it('returns false when any corner differs', () => {
      const a = makeQuad();
      const b = new GeoQuad(
        Coordinates.create(999, 10),
        Coordinates.create(10, 10),
        Coordinates.create(10, -10),
        Coordinates.create(-10, -10)
      );
      expect(a.equals(b)).toBe(false);
    });
  });
});
