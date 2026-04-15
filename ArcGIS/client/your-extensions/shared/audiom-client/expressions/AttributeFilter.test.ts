import { describe, it, expect } from 'vitest';
import { field, and, or, not, raw, FieldRef } from './AttributeFilter';
import { ComparisonOp, LogicalOp } from './Expression';

describe('field()', () => {
  it('returns a FieldRef', () => {
    expect(field('status')).toBeInstanceOf(FieldRef);
  });
});

describe('FieldRef', () => {
  const f = field('status');

  it('eq() creates a comparison expression', () => {
    const expr = f.eq('active');
    expect(expr).toEqual({
      type: 'comparison',
      field: 'status',
      op: ComparisonOp.Equal,
      value: 'active'
    });
  });

  it('neq()', () => {
    expect(f.neq('deleted')).toMatchObject({ op: ComparisonOp.NotEqual, value: 'deleted' });
  });

  it('lt()', () => {
    expect(field('height').lt(100)).toMatchObject({ op: ComparisonOp.LessThan, value: 100 });
  });

  it('gt()', () => {
    expect(field('height').gt(50)).toMatchObject({ op: ComparisonOp.GreaterThan, value: 50 });
  });

  it('lte()', () => {
    expect(field('height').lte(200)).toMatchObject({ op: ComparisonOp.LessThanOrEqual, value: 200 });
  });

  it('gte()', () => {
    expect(field('height').gte(10)).toMatchObject({ op: ComparisonOp.GreaterThanOrEqual, value: 10 });
  });

  it('like()', () => {
    const expr = f.like('active%');
    expect(expr).toEqual({ type: 'like', field: 'status', pattern: 'active%' });
  });

  it('notLike()', () => {
    const expr = f.notLike('deleted%');
    expect(expr).toEqual({ type: 'like', field: 'status', pattern: 'deleted%', not: true });
  });

  it('in()', () => {
    const expr = field('type').in(['a', 'b']);
    expect(expr).toEqual({ type: 'in', field: 'type', values: ['a', 'b'] });
  });

  it('notIn()', () => {
    const expr = field('type').notIn(['x']);
    expect(expr).toEqual({ type: 'in', field: 'type', values: ['x'], not: true });
  });

  it('between()', () => {
    const expr = field('pop').between(100, 999);
    expect(expr).toEqual({ type: 'between', field: 'pop', low: 100, high: 999 });
  });

  it('notBetween()', () => {
    const expr = field('pop').notBetween(0, 10);
    expect(expr).toEqual({ type: 'between', field: 'pop', low: 0, high: 10, not: true });
  });

  it('isNull()', () => {
    expect(f.isNull()).toEqual({ type: 'isNull', field: 'status' });
  });

  it('isNotNull()', () => {
    expect(f.isNotNull()).toEqual({ type: 'isNull', field: 'status', not: true });
  });
});

describe('and()', () => {
  it('creates a logical AND expression', () => {
    const a = field('x').eq(1);
    const b = field('y').eq(2);
    const expr = and(a, b);
    expect(expr).toEqual({
      type: 'logical',
      op: LogicalOp.And,
      children: [a, b]
    });
  });
});

describe('or()', () => {
  it('creates a logical OR expression', () => {
    const a = field('x').eq(1);
    const b = field('y').eq(2);
    expect(or(a, b).op).toBe(LogicalOp.Or);
  });
});

describe('not()', () => {
  it('wraps an expression in NOT', () => {
    const child = field('x').eq(1);
    expect(not(child)).toEqual({ type: 'not', child });
  });
});

describe('raw()', () => {
  it('wraps arbitrary SQL', () => {
    expect(raw("FUNC(a)")).toEqual({ type: 'raw', sql: 'FUNC(a)' });
  });
});
