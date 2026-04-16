import { describe, it, expect } from 'vitest';
import { toEsriSql } from './EsriSqlSerializer';
import { field, and, or, not, raw } from '../AttributeFilter';

describe('toEsriSql', () => {
  describe('comparison', () => {
    it('serializes string equality', () => {
      expect(toEsriSql(field('status').eq('active'))).toBe("status = 'active'");
    });

    it('serializes numeric comparison', () => {
      expect(toEsriSql(field('height').gt(100))).toBe('height > 100');
    });

    it('serializes null value', () => {
      expect(toEsriSql(field('x').eq(null))).toBe('x = NULL');
    });

    it('serializes boolean as 1/0', () => {
      expect(toEsriSql(field('active').eq(true))).toBe('active = 1');
      expect(toEsriSql(field('active').eq(false))).toBe('active = 0');
    });

    it('serializes Date as TIMESTAMP literal', () => {
      const d = new Date(Date.UTC(2024, 0, 15, 10, 30, 0));
      expect(toEsriSql(field('created').gt(d))).toBe(
        "created > TIMESTAMP '2024-01-15 10:30:00'"
      );
    });

    it('escapes single quotes in string values', () => {
      expect(toEsriSql(field('name').eq("O'Brien"))).toBe("name = 'O''Brien'");
    });
  });

  describe('logical', () => {
    it('serializes AND', () => {
      const expr = and(field('a').eq(1), field('b').eq(2));
      expect(toEsriSql(expr)).toBe('a = 1 AND b = 2');
    });

    it('serializes OR', () => {
      const expr = or(field('a').eq(1), field('b').eq(2));
      expect(toEsriSql(expr)).toBe('a = 1 OR b = 2');
    });

    it('wraps nested OR inside AND in parens', () => {
      const expr = and(
        field('type').eq('building'),
        or(field('height').gt(100), field('floors').gte(10))
      );
      expect(toEsriSql(expr)).toBe(
        "type = 'building' AND (height > 100 OR floors >= 10)"
      );
    });

    it('flattens same-precedence operators', () => {
      const expr = and(field('a').eq(1), field('b').eq(2), field('c').eq(3));
      expect(toEsriSql(expr)).toBe('a = 1 AND b = 2 AND c = 3');
    });
  });

  describe('not', () => {
    it('wraps expression in NOT ()', () => {
      expect(toEsriSql(not(field('x').eq(1)))).toBe('NOT (x = 1)');
    });
  });

  describe('like', () => {
    it('serializes LIKE', () => {
      expect(toEsriSql(field('name').like('Main%'))).toBe("name LIKE 'Main%'");
    });

    it('serializes NOT LIKE', () => {
      expect(toEsriSql(field('name').notLike('%test%'))).toBe("name NOT LIKE '%test%'");
    });
  });

  describe('in', () => {
    it('serializes IN with string values', () => {
      expect(toEsriSql(field('type').in(['a', 'b', 'c']))).toBe(
        "type IN ('a', 'b', 'c')"
      );
    });

    it('serializes NOT IN with numeric values', () => {
      expect(toEsriSql(field('id').notIn([1, 2, 3]))).toBe(
        'id NOT IN (1, 2, 3)'
      );
    });
  });

  describe('between', () => {
    it('serializes BETWEEN', () => {
      expect(toEsriSql(field('pop').between(1000, 50000))).toBe(
        'pop BETWEEN 1000 AND 50000'
      );
    });

    it('serializes NOT BETWEEN', () => {
      expect(toEsriSql(field('pop').notBetween(0, 10))).toBe(
        'pop NOT BETWEEN 0 AND 10'
      );
    });
  });

  describe('isNull', () => {
    it('serializes IS NULL', () => {
      expect(toEsriSql(field('notes').isNull())).toBe('notes IS NULL');
    });

    it('serializes IS NOT NULL', () => {
      expect(toEsriSql(field('notes').isNotNull())).toBe('notes IS NOT NULL');
    });
  });

  describe('raw', () => {
    it('passes through SQL verbatim', () => {
      expect(toEsriSql(raw("position(current_user in workers) > 0"))).toBe(
        "position(current_user in workers) > 0"
      );
    });
  });
});
