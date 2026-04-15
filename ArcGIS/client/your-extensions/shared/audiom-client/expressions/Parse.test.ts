import { describe, it, expect } from 'vitest';
import { parse } from './parsing';
import { toEsriSql } from './serializers/EsriSqlSerializer';

describe('parse', () => {
  describe('comparison', () => {
    it('parses string equality', () => {
      const expr = parse("status = 'active'");
      expect(expr).toEqual({
        type: 'comparison',
        field: 'status',
        op: '=',
        value: 'active'
      });
    });

    it('parses numeric comparison', () => {
      const expr = parse('height > 100');
      expect(expr).toEqual({
        type: 'comparison',
        field: 'height',
        op: '>',
        value: 100
      });
    });

    it('parses <> operator', () => {
      const expr = parse("type <> 'deleted'");
      expect(expr).toMatchObject({ op: '<>', value: 'deleted' });
    });

    it('parses <= and >= operators', () => {
      expect(parse('x <= 10')).toMatchObject({ op: '<=', value: 10 });
      expect(parse('x >= 5')).toMatchObject({ op: '>=', value: 5 });
    });

    it('parses NULL literal', () => {
      const expr = parse('x = NULL');
      expect(expr).toMatchObject({ type: 'comparison', value: null });
    });

    it('parses decimal numbers', () => {
      const expr = parse('x > 3.14');
      expect(expr).toMatchObject({ value: 3.14 });
    });

    it('parses escaped quotes in strings', () => {
      const expr = parse("name = 'O''Brien'");
      expect(expr).toMatchObject({ type: 'comparison', value: "O'Brien" });
    });

    it('parses TIMESTAMP literal', () => {
      const expr = parse("created > TIMESTAMP '2024-01-15 10:30:00'");
      expect(expr).toMatchObject({ type: 'comparison', field: 'created', op: '>' });
      if (expr.type === 'comparison' && expr.value instanceof Date) {
        expect(expr.value.getUTCFullYear()).toBe(2024);
        expect(expr.value.getUTCMonth()).toBe(0);
        expect(expr.value.getUTCDate()).toBe(15);
      } else {
        expect.unreachable('Expected Date value');
      }
    });
  });

  describe('logical', () => {
    it('parses AND', () => {
      const expr = parse("a = 1 AND b = 2");
      expect(expr).toMatchObject({
        type: 'logical',
        op: 'AND',
        children: [
          { type: 'comparison', field: 'a', value: 1 },
          { type: 'comparison', field: 'b', value: 2 }
        ]
      });
    });

    it('parses OR', () => {
      const expr = parse("a = 1 OR b = 2");
      expect(expr).toMatchObject({ type: 'logical', op: 'OR' });
    });

    it('respects AND/OR precedence', () => {
      // a = 1 OR b = 2 AND c = 3 should be: a = 1 OR (b = 2 AND c = 3)
      const expr = parse("a = 1 OR b = 2 AND c = 3");
      expect(expr.type).toBe('logical');
      if (expr.type === 'logical') {
        expect(expr.op).toBe('OR');
        expect(expr.children[0]).toMatchObject({ field: 'a' });
        expect(expr.children[1]).toMatchObject({ type: 'logical', op: 'AND' });
      }
    });

    it('flattens chained same-operators', () => {
      const expr = parse("a = 1 AND b = 2 AND c = 3");
      if (expr.type === 'logical') {
        expect(expr.children).toHaveLength(3);
      }
    });
  });

  describe('NOT', () => {
    it('parses NOT prefix', () => {
      const expr = parse("NOT status = 'deleted'");
      expect(expr).toMatchObject({
        type: 'not',
        child: { type: 'comparison', field: 'status', value: 'deleted' }
      });
    });
  });

  describe('LIKE', () => {
    it('parses LIKE expression', () => {
      const expr = parse("name LIKE 'Main%'");
      expect(expr).toEqual({ type: 'like', field: 'name', pattern: 'Main%' });
    });

    it('parses NOT LIKE expression', () => {
      const expr = parse("name NOT LIKE '%test%'");
      expect(expr).toEqual({ type: 'like', field: 'name', pattern: '%test%', not: true });
    });
  });

  describe('IN', () => {
    it('parses IN with string values', () => {
      const expr = parse("type IN ('a', 'b', 'c')");
      expect(expr).toMatchObject({
        type: 'in',
        field: 'type',
        values: ['a', 'b', 'c']
      });
    });

    it('parses NOT IN with numeric values', () => {
      const expr = parse("id NOT IN (1, 2, 3)");
      expect(expr).toMatchObject({
        type: 'in',
        field: 'id',
        values: [1, 2, 3],
        not: true
      });
    });
  });

  describe('BETWEEN', () => {
    it('parses BETWEEN', () => {
      const expr = parse("pop BETWEEN 1000 AND 50000");
      expect(expr).toMatchObject({
        type: 'between',
        field: 'pop',
        low: 1000,
        high: 50000
      });
    });

    it('parses NOT BETWEEN', () => {
      const expr = parse("pop NOT BETWEEN 0 AND 10");
      expect(expr).toMatchObject({
        type: 'between',
        field: 'pop',
        low: 0,
        high: 10,
        not: true
      });
    });
  });

  describe('IS NULL', () => {
    it('parses IS NULL', () => {
      const expr = parse("notes IS NULL");
      expect(expr).toEqual({ type: 'isNull', field: 'notes', not: false });
    });

    it('parses IS NOT NULL', () => {
      const expr = parse("notes IS NOT NULL");
      expect(expr).toEqual({ type: 'isNull', field: 'notes', not: true });
    });
  });

  describe('parenthesized groups', () => {
    it('parses parenthesized subexpression', () => {
      const expr = parse("a = 1 AND (b = 2 OR c = 3)");
      expect(expr.type).toBe('logical');
      if (expr.type === 'logical') {
        expect(expr.op).toBe('AND');
        expect(expr.children[1]).toMatchObject({ type: 'logical', op: 'OR' });
      }
    });
  });

  describe('fallback', () => {
    it('returns RawExpr for empty string', () => {
      expect(parse('')).toEqual({ type: 'raw', sql: '' });
    });

    it('returns RawExpr for unparseable input', () => {
      const expr = parse('SOME_FUNC(a, b) + 3');
      expect(expr.type).toBe('raw');
      if (expr.type === 'raw') {
        expect(expr.sql).toBe('SOME_FUNC(a, b) + 3');
      }
    });
  });

  describe('roundtrip: toString → parse', () => {
    const cases = [
      "status = 'active'",
      'height > 100',
      "type = 'building' AND status = 'active'",
      "a = 1 OR b = 2",
      "name LIKE 'Main%'",
      "type IN ('a', 'b', 'c')",
      'pop BETWEEN 1000 AND 50000',
      'notes IS NULL',
      'notes IS NOT NULL',
    ];

    for (const sql of cases) {
      it(`roundtrips: ${sql}`, () => {
        const parsed = parse(sql);
        const serialized = toEsriSql(parsed);
        expect(serialized).toBe(sql);
      });
    }
  });
});
