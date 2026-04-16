/**
 * Typed expression AST for building feature query filters.
 *
 * Supports the SQL-92 subset used by Esri feature services, plus extensions
 * for spatial and temporal filtering.
 *
 * @see https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/
 * @see https://developers.arcgis.com/rest/services-reference/enterprise/sql-reference-for-query-expressions-used-in-the-arcgis-rest-api/
 * @see https://docs.ogc.org/is/21-065r2/21-065r2.html (OGC CQL2, informational)
 */

// ── Comparison operators ────────────────────────────────────────────

export enum ComparisonOp {
  Equal = '=',
  NotEqual = '<>',
  LessThan = '<',
  GreaterThan = '>',
  LessThanOrEqual = '<=',
  GreaterThanOrEqual = '>='
}

// ── Logical operators ───────────────────────────────────────────────

export enum LogicalOp {
  And = 'AND',
  Or = 'OR'
}

// ── Expression node types ───────────────────────────────────────────

export enum ExpressionType {
  Comparison = 'comparison',
  Logical = 'logical',
  Not = 'not',
  Like = 'like',
  In = 'in',
  Between = 'between',
  IsNull = 'isNull',
  Raw = 'raw'
}

// ── Literal value types allowed in expressions ──────────────────────

export type LiteralValue = string | number | boolean | Date | null;

// ── AST node types (discriminated union) ────────────────────────────

export interface ComparisonExpr {
  type: ExpressionType.Comparison;
  field: string;
  op: ComparisonOp;
  value: LiteralValue;
}

export interface LogicalExpr {
  type: ExpressionType.Logical;
  op: LogicalOp;
  children: Expression[];
}

export interface NotExpr {
  type: ExpressionType.Not;
  child: Expression;
}

export interface LikeExpr {
  type: ExpressionType.Like;
  field: string;
  pattern: string;
  not?: boolean;
}

export interface InExpr {
  type: ExpressionType.In;
  field: string;
  values: LiteralValue[];
  not?: boolean;
}

export interface BetweenExpr {
  type: ExpressionType.Between;
  field: string;
  low: LiteralValue;
  high: LiteralValue;
  not?: boolean;
}

export interface IsNullExpr {
  type: ExpressionType.IsNull;
  field: string;
  not?: boolean;
}

/**
 * Escape hatch for raw SQL strings that can't be represented by the typed AST.
 * Use `raw(sql)` from AttributeFilter to create these.
 */
export interface RawExpr {
  type: ExpressionType.Raw;
  sql: string;
}

/**
 * Discriminated union of all expression node types.
 */
export type Expression =
  | ComparisonExpr
  | LogicalExpr
  | NotExpr
  | LikeExpr
  | InExpr
  | BetweenExpr
  | IsNullExpr
  | RawExpr;
