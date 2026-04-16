/**
 * Serialize an Expression AST to Overpass QL tag filter syntax.
 *
 * Overpass QL uses bracket syntax for tag filters:
 * - Equality: `["highway"="footway"]`
 * - Inequality: `["highway"!="footway"]`
 * - Exists: `["name"]`
 * - Not exists: `[!"name"]`
 * - Regex: `["name"~"^Main"]`
 * - Negated regex: `["name"!~"test"]`
 *
 * AND is implicit (concatenated brackets). OR requires union blocks which
 * are not supported by this simple serializer — an error is thrown.
 *
 * @see https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL
 */

import { Expression, ExpressionType, ComparisonOp, LogicalOp, LiteralValue } from '../Expression';

/**
 * Error thrown when an expression cannot be represented in Overpass QL.
 */
export class UnsupportedOverpassExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedOverpassExpressionError';
  }
}

/**
 * Convert a SQL LIKE pattern to a regex pattern.
 * `%` → `.*`, `_` → `.`, escape regex-special chars.
 */
function likePatternToRegex(pattern: string): string {
  let result = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '%') {
      result += '.*';
    } else if (ch === '_') {
      result += '.';
    } else if ('.+*?^${}()|[]\\'.includes(ch)) {
      result += `\\${ch}`;
    } else {
      result += ch;
    }
  }
  return result;
}

/**
 * Escape a string value for use inside Overpass QL double-quoted strings.
 */
function escapeOverpassValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Format a literal value for Overpass QL tag filter.
 */
function literalToOverpass(value: LiteralValue): string {
  if (value === null) {
    throw new UnsupportedOverpassExpressionError('NULL values are not supported in Overpass QL tag filters');
  }
  if (typeof value === 'string') {
    return escapeOverpassValue(value);
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }
  if (value instanceof Date) {
    throw new UnsupportedOverpassExpressionError('Date values in tag filters are not supported; use Overpass date settings instead');
  }
  return String(value);
}

function comparisonOpToOverpass(op: ComparisonOp): string {
  switch (op) {
    case ComparisonOp.Equal:
      return '=';
    case ComparisonOp.NotEqual:
      return '!=';
    default:
      throw new UnsupportedOverpassExpressionError(
        `Comparison operator '${op}' is not supported in Overpass QL tag filters`
      );
  }
}

/**
 * Serialize an Expression AST node to Overpass QL tag filter brackets.
 *
 * Returns one or more concatenated bracket filters (implicit AND).
 *
 * @throws {UnsupportedOverpassExpressionError} for expressions that cannot
 * be represented in Overpass QL bracket syntax.
 */
export function toOverpassFilters(expr: Expression): string {
  switch (expr.type) {
    case ExpressionType.Comparison: {
      const op = comparisonOpToOverpass(expr.op);
      const val = literalToOverpass(expr.value);
      return `["${escapeOverpassValue(expr.field)}"${op}"${val}"]`;
    }

    case ExpressionType.Logical: {
      if (expr.op === LogicalOp.Or) {
        throw new UnsupportedOverpassExpressionError(
          'OR expressions require Overpass union blocks, which are not supported by the simple tag serializer'
        );
      }
      // AND: concatenate bracket filters
      return expr.children.map(child => toOverpassFilters(child)).join('');
    }

    case ExpressionType.Not: {
      // NOT on a single comparison can be inverted
      const child = expr.child;
      if (child.type === ExpressionType.IsNull) {
        // NOT IS NULL → key exists → ["key"]
        return `["${escapeOverpassValue(child.field)}"]`;
      }
      throw new UnsupportedOverpassExpressionError(
        'NOT expressions are only supported for IS NULL checks in Overpass QL'
      );
    }

    case ExpressionType.Like: {
      const regex = likePatternToRegex(expr.pattern);
      const field = escapeOverpassValue(expr.field);
      if (expr.not) {
        return `["${field}"!~"${escapeOverpassValue(regex)}"]`;
      }
      return `["${field}"~"${escapeOverpassValue(regex)}"]`;
    }

    case ExpressionType.IsNull: {
      if (expr.not) {
        // IS NOT NULL → key exists → ["key"]
        return `["${escapeOverpassValue(expr.field)}"]`;
      }
      // IS NULL → key does not exist → [!"key"]
      return `[!"${escapeOverpassValue(expr.field)}"]`;
    }

    case ExpressionType.In: {
      // IN → regex alternation: ["field"~"^(a|b|c)$"]
      const field = escapeOverpassValue(expr.field);
      const alts = expr.values.map(v => {
        const s = literalToOverpass(v);
        // Escape regex-special chars in the value
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }).join('|');
      const regex = `^(${alts})$`;
      if (expr.not) {
        return `["${field}"!~"${escapeOverpassValue(regex)}"]`;
      }
      return `["${field}"~"${escapeOverpassValue(regex)}"]`;
    }

    case ExpressionType.Between:
      throw new UnsupportedOverpassExpressionError(
        'BETWEEN expressions are not supported in Overpass QL tag filters'
      );

    case ExpressionType.Raw:
      throw new UnsupportedOverpassExpressionError(
        'Raw SQL expressions cannot be converted to Overpass QL'
      );
  }
}
