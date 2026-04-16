import { describe, it, expect } from 'vitest';
import { toOverpassFilters, UnsupportedOverpassExpressionError } from './OverpassTagSerializer';
import { field, and, or, not, raw } from '../AttributeFilter';

describe('toOverpassFilters', () => {
  describe('comparison', () => {
    it('serializes equality', () => {
      expect(toOverpassFilters(field('highway').eq('footway'))).toBe(
        '["highway"="footway"]'
      );
    });

    it('serializes inequality', () => {
      expect(toOverpassFilters(field('highway').neq('motorway'))).toBe(
        '["highway"!="motorway"]'
      );
    });

    it('serializes numeric equality', () => {
      expect(toOverpassFilters(field('lanes').eq(2))).toBe('["lanes"="2"]');
    });

    it('serializes boolean as yes/no', () => {
      expect(toOverpassFilters(field('oneway').eq(true))).toBe('["oneway"="yes"]');
      expect(toOverpassFilters(field('oneway').eq(false))).toBe('["oneway"="no"]');
    });

    it('throws for unsupported comparison operators', () => {
      expect(() => toOverpassFilters(field('lanes').gt(2))).toThrow(
        UnsupportedOverpassExpressionError
      );
      expect(() => toOverpassFilters(field('lanes').lt(2))).toThrow(
        UnsupportedOverpassExpressionError
      );
      expect(() => toOverpassFilters(field('lanes').gte(2))).toThrow(
        UnsupportedOverpassExpressionError
      );
      expect(() => toOverpassFilters(field('lanes').lte(2))).toThrow(
        UnsupportedOverpassExpressionError
      );
    });

    it('throws for null value', () => {
      expect(() => toOverpassFilters(field('name').eq(null))).toThrow(
        UnsupportedOverpassExpressionError
      );
    });
  });

  describe('logical AND', () => {
    it('concatenates bracket filters for AND', () => {
      const expr = and(
        field('highway').eq('footway'),
        field('surface').eq('asphalt')
      );
      expect(toOverpassFilters(expr)).toBe(
        '["highway"="footway"]["surface"="asphalt"]'
      );
    });

    it('concatenates three bracket filters', () => {
      const expr = and(
        field('highway').eq('footway'),
        field('surface').eq('asphalt'),
        field('lit').eq(true)
      );
      expect(toOverpassFilters(expr)).toBe(
        '["highway"="footway"]["surface"="asphalt"]["lit"="yes"]'
      );
    });
  });

  describe('logical OR', () => {
    it('throws for OR expressions', () => {
      const expr = or(
        field('highway').eq('footway'),
        field('highway').eq('cycleway')
      );
      expect(() => toOverpassFilters(expr)).toThrow(
        UnsupportedOverpassExpressionError
      );
    });
  });

  describe('not', () => {
    it('converts NOT IS NULL to key-exists check', () => {
      expect(toOverpassFilters(not(field('name').isNull()))).toBe('["name"]');
    });

    it('throws for NOT on non-isNull expressions', () => {
      expect(() => toOverpassFilters(not(field('x').eq(1)))).toThrow(
        UnsupportedOverpassExpressionError
      );
    });
  });

  describe('like', () => {
    it('converts LIKE pattern to regex', () => {
      expect(toOverpassFilters(field('name').like('Main%'))).toBe(
        '["name"~"Main.*"]'
      );
    });

    it('converts NOT LIKE to negated regex', () => {
      expect(toOverpassFilters(field('name').notLike('%test%'))).toBe(
        '["name"!~".*test.*"]'
      );
    });

    it('converts underscore wildcard to dot', () => {
      expect(toOverpassFilters(field('ref').like('A_1'))).toBe(
        '["ref"~"A.1"]'
      );
    });

    it('escapes regex-special chars in LIKE pattern', () => {
      expect(toOverpassFilters(field('name').like('file.txt'))).toBe(
        '["name"~"file\\\\.txt"]'
      );
    });
  });

  describe('isNull', () => {
    it('serializes IS NULL as key-not-exists', () => {
      expect(toOverpassFilters(field('name').isNull())).toBe('[!"name"]');
    });

    it('serializes IS NOT NULL as key-exists', () => {
      expect(toOverpassFilters(field('name').isNotNull())).toBe('["name"]');
    });
  });

  describe('in', () => {
    it('converts IN to regex alternation', () => {
      expect(toOverpassFilters(field('highway').in(['footway', 'cycleway', 'path']))).toBe(
        '["highway"~"^(footway|cycleway|path)$"]'
      );
    });

    it('converts NOT IN to negated regex alternation', () => {
      expect(toOverpassFilters(field('highway').notIn(['motorway', 'trunk']))).toBe(
        '["highway"!~"^(motorway|trunk)$"]'
      );
    });
  });

  describe('unsupported expressions', () => {
    it('throws for BETWEEN', () => {
      expect(() => toOverpassFilters(field('pop').between(1000, 5000))).toThrow(
        UnsupportedOverpassExpressionError
      );
    });

    it('throws for raw SQL', () => {
      expect(() => toOverpassFilters(raw('custom SQL'))).toThrow(
        UnsupportedOverpassExpressionError
      );
    });
  });

  describe('escaping', () => {
    it('escapes double quotes in field names', () => {
      expect(toOverpassFilters(field('name"test').eq('value'))).toBe(
        '["name\\"test"="value"]'
      );
    });

    it('escapes double quotes in values', () => {
      expect(toOverpassFilters(field('name').eq('say "hello"'))).toBe(
        '["name"="say \\"hello\\""]'
      );
    });

    it('escapes backslashes', () => {
      expect(toOverpassFilters(field('path').eq('a\\b'))).toBe(
        '["path"="a\\\\b"]'
      );
    });
  });
});
