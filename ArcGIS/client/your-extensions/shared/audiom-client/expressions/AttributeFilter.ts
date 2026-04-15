/**
 * Fluent builder API for constructing typed WHERE clause expressions.
 *
 * @example
 * ```ts
 * import { field, and, or, not, raw } from './expressions';
 *
 * // Simple comparison
 * field('status').eq('active')
 *
 * // Compound expression
 * and(
 *   field('type').eq('building'),
 *   or(
 *     field('height').gt(100),
 *     field('floors').gte(10)
 *   )
 * )
 *
 * // Pattern matching and set membership
 * field('name').like('Main%')
 * field('category').in(['residential', 'commercial'])
 *
 * // Range and null checks
 * field('population').between(1000, 50000)
 * field('notes').isNotNull()
 *
 * // Escape hatch for vendor-specific SQL
 * raw("position(current_user in workersfield) > 0")
 * ```
 *
 * @see https://developers.arcgis.com/rest/services-reference/enterprise/sql-reference-for-query-expressions-used-in-the-arcgis-rest-api/
 */

import {
  Expression,
  ExpressionType,
  ComparisonOp,
  LogicalOp,
  LiteralValue,
  ComparisonExpr,
  LogicalExpr,
  NotExpr,
  LikeExpr,
  InExpr,
  BetweenExpr,
  IsNullExpr,
  RawExpr
} from './Expression';

// ── Field reference builder ─────────────────────────────────────────

export class FieldRef {
  constructor(private readonly name: string) {}

  eq(value: LiteralValue): ComparisonExpr {
    return { type: ExpressionType.Comparison, field: this.name, op: ComparisonOp.Equal, value };
  }

  neq(value: LiteralValue): ComparisonExpr {
    return { type: ExpressionType.Comparison, field: this.name, op: ComparisonOp.NotEqual, value };
  }

  lt(value: LiteralValue): ComparisonExpr {
    return { type: ExpressionType.Comparison, field: this.name, op: ComparisonOp.LessThan, value };
  }

  gt(value: LiteralValue): ComparisonExpr {
    return { type: ExpressionType.Comparison, field: this.name, op: ComparisonOp.GreaterThan, value };
  }

  lte(value: LiteralValue): ComparisonExpr {
    return { type: ExpressionType.Comparison, field: this.name, op: ComparisonOp.LessThanOrEqual, value };
  }

  gte(value: LiteralValue): ComparisonExpr {
    return { type: ExpressionType.Comparison, field: this.name, op: ComparisonOp.GreaterThanOrEqual, value };
  }

  /**
   * SQL LIKE pattern matching.
   * Use `%` for any characters, `_` for a single character.
   */
  like(pattern: string): LikeExpr {
    return { type: ExpressionType.Like, field: this.name, pattern };
  }

  notLike(pattern: string): LikeExpr {
    return { type: ExpressionType.Like, field: this.name, pattern, not: true };
  }

  in(values: LiteralValue[]): InExpr {
    return { type: ExpressionType.In, field: this.name, values };
  }

  notIn(values: LiteralValue[]): InExpr {
    return { type: ExpressionType.In, field: this.name, values, not: true };
  }

  between(low: LiteralValue, high: LiteralValue): BetweenExpr {
    return { type: ExpressionType.Between, field: this.name, low, high };
  }

  notBetween(low: LiteralValue, high: LiteralValue): BetweenExpr {
    return { type: ExpressionType.Between, field: this.name, low, high, not: true };
  }

  isNull(): IsNullExpr {
    return { type: ExpressionType.IsNull, field: this.name };
  }

  isNotNull(): IsNullExpr {
    return { type: ExpressionType.IsNull, field: this.name, not: true };
  }
}

// ── Top-level builder functions ─────────────────────────────────────

/**
 * Start building an expression by referencing a field name.
 */
export function field(name: string): FieldRef {
  return new FieldRef(name);
}

/**
 * Combine expressions with AND.
 */
export function and(...children: Expression[]): LogicalExpr {
  return { type: ExpressionType.Logical, op: LogicalOp.And, children };
}

/**
 * Combine expressions with OR.
 */
export function or(...children: Expression[]): LogicalExpr {
  return { type: ExpressionType.Logical, op: LogicalOp.Or, children };
}

/**
 * Negate an expression with NOT.
 */
export function not(child: Expression): NotExpr {
  return { type: ExpressionType.Not, child };
}

/**
 * Escape hatch: embed a raw SQL string as an expression node.
 * Use this for vendor-specific syntax not covered by the typed builder
 * (e.g., `CURRENT_USER`, `position()`, Esri-specific functions).
 *
 * **Security:** The SQL string is emitted verbatim with no escaping.
 * Never pass untrusted / user-supplied input directly to this function.
 */
export function raw(sql: string): RawExpr {
  return { type: ExpressionType.Raw, sql };
}
