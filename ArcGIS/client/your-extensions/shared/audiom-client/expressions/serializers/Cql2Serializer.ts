/**
 * Serialize an Expression AST to OGC CQL2-Text format.
 *
 * CQL2-Text is similar to SQL-92 but with differences in literal formatting:
 * - Booleans: `TRUE` / `FALSE` (not `1` / `0`)
 * - Dates: `TIMESTAMP('2024-01-15T10:30:00Z')` (ISO 8601 in function-call syntax)
 * - Strings: single-quoted with doubled escaping (same as SQL-92)
 * - Operators: identical to SQL-92 (`=`, `<>`, `AND`, `OR`, `NOT`, `LIKE`, `IN`, `BETWEEN`, `IS NULL`)
 *
 * @see https://docs.ogc.org/is/21-065r2/21-065r2.html
 */

import { Expression, ExpressionType, ComparisonExpr, LogicalExpr, LikeExpr, InExpr, BetweenExpr, IsNullExpr, LiteralValue } from '../Expression';
import { toRfc3339 } from '../temporal/DateTimeFilter';

// ── CQL2 keyword constants ──────────────────────────────────────────

enum Cql2Keyword {
  Null = 'NULL',
  True = 'TRUE',
  False = 'FALSE',
  Not = 'NOT',
  And = 'AND',
  Like = 'LIKE',
  NotLike = 'NOT LIKE',
  In = 'IN',
  NotIn = 'NOT IN',
  Between = 'BETWEEN',
  NotBetween = 'NOT BETWEEN',
  IsNull = 'IS NULL',
  IsNotNull = 'IS NOT NULL',
  Timestamp = 'TIMESTAMP',
}

const SINGLE_QUOTE_PATTERN = /'/g;

/**
 * Serialize a literal value to its CQL2-Text string representation.
 */
function literalToCql2(value: LiteralValue): string {
  if (value === null) {
    return Cql2Keyword.Null;
  }
  if (typeof value === 'string') {
    return `'${value.replace(SINGLE_QUOTE_PATTERN, "''")}'`;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? Cql2Keyword.True : Cql2Keyword.False;
  }
  if (value instanceof Date) {
    return `${Cql2Keyword.Timestamp}('${toRfc3339(value)}')`;    
  }
  return String(value);
}

function comparisonToCql2(expr: ComparisonExpr): string {
  return `${expr.field} ${expr.op} ${literalToCql2(expr.value)}`;
}

function logicalToCql2(expr: LogicalExpr): string {
  const parts = expr.children.map(child => {
    const serialized = toCql2Text(child);
    if (child.type === ExpressionType.Logical && child.op !== expr.op) {
      return `(${serialized})`;
    }
    return serialized;
  });
  return parts.join(` ${expr.op} `);
}

function likeToCql2(expr: LikeExpr): string {
  const keyword = expr.not ? Cql2Keyword.NotLike : Cql2Keyword.Like;
  return `${expr.field} ${keyword} '${expr.pattern.replace(SINGLE_QUOTE_PATTERN, "''")}'`;
}

function inToCql2(expr: InExpr): string {
  const keyword = expr.not ? Cql2Keyword.NotIn : Cql2Keyword.In;
  const serializedValues = expr.values.map(literalToCql2).join(', ');
  return `${expr.field} ${keyword} (${serializedValues})`;
}

function betweenToCql2(expr: BetweenExpr): string {
  const keyword = expr.not ? Cql2Keyword.NotBetween : Cql2Keyword.Between;
  return `${expr.field} ${keyword} ${literalToCql2(expr.low)} ${Cql2Keyword.And} ${literalToCql2(expr.high)}`;
}

function isNullToCql2(expr: IsNullExpr): string {
  return expr.not
    ? `${expr.field} ${Cql2Keyword.IsNotNull}`
    : `${expr.field} ${Cql2Keyword.IsNull}`;
}

/**
 * Serialize an Expression AST node to a CQL2-Text string.
 *
 * **Note:** `RawExpr` nodes are passed through unmodified. Raw SQL
 * fragments authored for Esri SQL-92 may not constitute valid CQL2-Text
 * (e.g., different function syntax or literal formats).
 */
export function toCql2Text(expr: Expression): string {
  switch (expr.type) {
    case ExpressionType.Comparison:
      return comparisonToCql2(expr);
    case ExpressionType.Logical:
      return logicalToCql2(expr);
    case ExpressionType.Not:
      return `${Cql2Keyword.Not} (${toCql2Text(expr.child)})`;
    case ExpressionType.Like:
      return likeToCql2(expr);
    case ExpressionType.In:
      return inToCql2(expr);
    case ExpressionType.Between:
      return betweenToCql2(expr);
    case ExpressionType.IsNull:
      return isNullToCql2(expr);
    case ExpressionType.Raw:
      return expr.sql;
  }
}
