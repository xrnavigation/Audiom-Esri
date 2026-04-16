import { describe, it, expect } from 'vitest';
import {
  ComparisonOp,
  LogicalOp,
  ExpressionType,
} from './Expression';
import type {
  ComparisonExpr,
  LogicalExpr,
  NotExpr,
  LikeExpr,
  InExpr,
  BetweenExpr,
  IsNullExpr,
  RawExpr,
  Expression,
} from './Expression';

describe('Expression AST types', () => {
  it('ComparisonExpr has the correct shape', () => {
    const expr: ComparisonExpr = {
      type: ExpressionType.Comparison,
      field: 'status',
      op: ComparisonOp.Equal,
      value: 'active'
    };
    expect(expr.type).toBe(ExpressionType.Comparison);
    expect(expr.op).toBe('=');
  });

  it('LogicalExpr combines children', () => {
    const left: ComparisonExpr = { type: ExpressionType.Comparison, field: 'a', op: ComparisonOp.LessThan, value: 5 };
    const right: ComparisonExpr = { type: ExpressionType.Comparison, field: 'b', op: ComparisonOp.GreaterThan, value: 10 };
    const expr: LogicalExpr = { type: ExpressionType.Logical, op: LogicalOp.And, children: [left, right] };
    expect(expr.children).toHaveLength(2);
    expect(expr.op).toBe('AND');
  });

  it('NotExpr wraps a child', () => {
    const child: ComparisonExpr = { type: ExpressionType.Comparison, field: 'x', op: ComparisonOp.Equal, value: 1 };
    const expr: NotExpr = { type: ExpressionType.Not, child };
    expect(expr.type).toBe(ExpressionType.Not);
    expect(expr.child).toBe(child);
  });

  it('LikeExpr supports optional not flag', () => {
    const expr: LikeExpr = { type: ExpressionType.Like, field: 'name', pattern: 'Main%' };
    expect(expr.not).toBeUndefined();

    const negated: LikeExpr = { type: ExpressionType.Like, field: 'name', pattern: 'Main%', not: true };
    expect(negated.not).toBe(true);
  });

  it('InExpr supports value lists', () => {
    const expr: InExpr = { type: ExpressionType.In, field: 'type', values: ['a', 'b', 'c'] };
    expect(expr.values).toHaveLength(3);
  });

  it('BetweenExpr stores low and high', () => {
    const expr: BetweenExpr = { type: ExpressionType.Between, field: 'pop', low: 100, high: 999 };
    expect(expr.low).toBe(100);
    expect(expr.high).toBe(999);
  });

  it('IsNullExpr supports not flag', () => {
    const expr: IsNullExpr = { type: ExpressionType.IsNull, field: 'notes' };
    expect(expr.not).toBeUndefined();

    const notNull: IsNullExpr = { type: ExpressionType.IsNull, field: 'notes', not: true };
    expect(notNull.not).toBe(true);
  });

  it('RawExpr holds arbitrary SQL', () => {
    const expr: RawExpr = { type: ExpressionType.Raw, sql: 'FUNC(a, b)' };
    expect(expr.sql).toBe('FUNC(a, b)');
  });

  it('Expression union can be discriminated by type', () => {
    const expr: Expression = { type: ExpressionType.Comparison, field: 'x', op: ComparisonOp.Equal, value: 1 };
    switch (expr.type) {
      case ExpressionType.Comparison:
        expect(expr.field).toBe('x');
        break;
      default:
        expect.unreachable('Expected comparison');
    }
  });
});

describe('ComparisonOp enum', () => {
  it('maps to SQL operator strings', () => {
    expect(ComparisonOp.Equal).toBe('=');
    expect(ComparisonOp.NotEqual).toBe('<>');
    expect(ComparisonOp.LessThan).toBe('<');
    expect(ComparisonOp.GreaterThan).toBe('>');
    expect(ComparisonOp.LessThanOrEqual).toBe('<=');
    expect(ComparisonOp.GreaterThanOrEqual).toBe('>=');
  });
});

describe('LogicalOp enum', () => {
  it('maps to SQL keywords', () => {
    expect(LogicalOp.And).toBe('AND');
    expect(LogicalOp.Or).toBe('OR');
  });
});
