import { describe, it, expect } from 'vitest';
import { toCql2Text } from './Cql2Serializer';
import { field, and, or, not, raw } from '../AttributeFilter';

describe('toCql2Text', () => {
  describe('comparison', () => {
    it('serializes string equality', () => {
      expect(toCql2Text(field('status').eq('active'))).toBe("status = 'active'");
    });

    it('serializes numeric comparison', () => {
      expect(toCql2Text(field('height').gt(100))).toBe('height > 100');
    });

    it('serializes null value', () => {
      expect(toCql2Text(field('x').eq(null))).toBe('x = NULL');
    });

    it('serializes boolean as TRUE/FALSE', () => {
      expect(toCql2Text(field('active').eq(true))).toBe('active = TRUE');
      expect(toCql2Text(field('active').eq(false))).toBe('active = FALSE');
    });

    it('serializes Date as ISO 8601 TIMESTAMP function', () => {
      const d = new Date(Date.UTC(2024, 0, 15, 10, 30, 0));
      expect(toCql2Text(field('created').gt(d))).toBe(
        "created > TIMESTAMP('2024-01-15T10:30:00Z')"
      );
    });

    it('escapes single quotes in string values', () => {
      expect(toCql2Text(field('name').eq("O'Brien"))).toBe("name = 'O''Brien'");
    });
  });

  describe('logical', () => {
    it('serializes AND', () => {
      const expr = and(field('a').eq(1), field('b').eq(2));
      expect(toCql2Text(expr)).toBe('a = 1 AND b = 2');
    });

    it('serializes OR', () => {
      const expr = or(field('a').eq(1), field('b').eq(2));
      expect(toCql2Text(expr)).toBe('a = 1 OR b = 2');
    });

    it('wraps nested OR inside AND in parens', () => {
      const expr = and(
        field('type').eq('building'),
        or(field('height').gt(100), field('floors').gte(10))
      );
      expect(toCql2Text(expr)).toBe(
        "type = 'building' AND (height > 100 OR floors >= 10)"
      );
    });

    it('flattens same-precedence operators', () => {
      const expr = and(field('a').eq(1), field('b').eq(2), field('c').eq(3));
      expect(toCql2Text(expr)).toBe('a = 1 AND b = 2 AND c = 3');
    });
  });

  describe('not', () => {
    it('wraps expression in NOT ()', () => {
      expect(toCql2Text(not(field('x').eq(1)))).toBe('NOT (x = 1)');
    });
  });

  describe('like', () => {
    it('serializes LIKE', () => {
      expect(toCql2Text(field('name').like('Main%'))).toBe("name LIKE 'Main%'");
    });

    it('serializes NOT LIKE', () => {
      expect(toCql2Text(field('name').notLike('%test%'))).toBe("name NOT LIKE '%test%'");
    });
  });

  describe('in', () => {
    it('serializes IN with string values', () => {
      expect(toCql2Text(field('type').in(['a', 'b', 'c']))).toBe(
        "type IN ('a', 'b', 'c')"
      );
    });

    it('serializes NOT IN with numeric values', () => {
      expect(toCql2Text(field('id').notIn([1, 2, 3]))).toBe(
        'id NOT IN (1, 2, 3)'
      );
    });
  });

  describe('between', () => {
    it('serializes BETWEEN', () => {
      expect(toCql2Text(field('pop').between(1000, 50000))).toBe(
        'pop BETWEEN 1000 AND 50000'
      );
    });

    it('serializes NOT BETWEEN', () => {
      expect(toCql2Text(field('pop').notBetween(0, 10))).toBe(
        'pop NOT BETWEEN 0 AND 10'
      );
    });
  });

  describe('isNull', () => {
    it('serializes IS NULL', () => {
      expect(toCql2Text(field('notes').isNull())).toBe('notes IS NULL');
    });

    it('serializes IS NOT NULL', () => {
      expect(toCql2Text(field('notes').isNotNull())).toBe('notes IS NOT NULL');
    });
  });

  describe('raw', () => {
    it('passes through expression verbatim', () => {
      expect(toCql2Text(raw("position(current_user in workers) > 0"))).toBe(
        "position(current_user in workers) > 0"
      );
    });
  });

  describe('CQL2-specific differences from Esri SQL', () => {
    it('uses TRUE/FALSE instead of 1/0 for booleans', () => {
      expect(toCql2Text(field('active').eq(true))).toBe('active = TRUE');
      expect(toCql2Text(field('active').eq(false))).toBe('active = FALSE');
    });

    it('uses ISO 8601 TIMESTAMP function syntax for dates', () => {
      const d = new Date(Date.UTC(2018, 1, 12, 23, 20, 52));
      expect(toCql2Text(field('updated').gt(d))).toBe(
        "updated > TIMESTAMP('2018-02-12T23:20:52Z')"
      );
    });
  });
});
