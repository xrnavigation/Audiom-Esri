/**
 * Recursive descent parser: SQL-92 WHERE clause string → Expression AST.
 *
 * Supports the subset used by Esri feature services:
 * - Comparison operators: =, <>, <, >, <=, >=
 * - Logical operators: AND, OR, NOT
 * - LIKE / NOT LIKE with wildcards
 * - IN / NOT IN (value lists)
 * - BETWEEN / NOT BETWEEN
 * - IS NULL / IS NOT NULL
 * - Parenthesized groups
 * - String literals (single-quoted), numeric literals, NULL
 * - TIMESTAMP literals
 *
 * Falls back to RawExpr for unrecognized syntax instead of throwing.
 *
 * @see https://developers.arcgis.com/rest/services-reference/enterprise/sql-reference-for-query-expressions-used-in-the-arcgis-rest-api/
 */

import {
  Expression,
  ExpressionType,
  ComparisonOp,
  LogicalOp,
  LiteralValue,
  RawExpr
} from '../Expression';

import { Token, TokenType } from './Constants';
import { Tokenizer } from './Tokenizer';

// ── UTC timezone suffix for TIMESTAMP parsing ───────────────────────

const UTC_SUFFIX = 'Z';

// ── Parser ──────────────────────────────────────────────────────────

class Parser {
  private readonly tokens: Token[];
  private pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: TokenType): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw new Error(`Expected ${type} but got ${token.type} ('${token.value}') at position ${token.pos}`);
    }
    return this.advance();
  }

  private match(type: TokenType): Token | null {
    if (this.peek().type === type) {
      return this.advance();
    }
    return null;
  }

  private parseLiteral(): LiteralValue {
    const token = this.peek();
    if (token.type === TokenType.String) {
      this.advance();
      return token.value;
    }
    if (token.type === TokenType.Number) {
      this.advance();
      return token.value.includes('.') ? parseFloat(token.value) : parseInt(token.value, 10);
    }
    if (token.type === TokenType.Null) {
      this.advance();
      return null;
    }
    if (token.type === TokenType.Timestamp) {
      this.advance();
      return new Date(token.value + UTC_SUFFIX);
    }
    throw new Error(`Expected literal value at position ${token.pos}`);
  }

  isAtEnd(): boolean {
    return this.peek().type === TokenType.Eof;
  }

  /**
   * Parse OR expressions (lowest precedence).
   */
  parseOr(): Expression {
    let left = this.parseAnd();

    while (this.peek().type === TokenType.Or) {
      this.advance();
      const right = this.parseAnd();
      if (left.type === ExpressionType.Logical && left.op === LogicalOp.Or) {
        left.children.push(right);
      } else {
        left = { type: ExpressionType.Logical, op: LogicalOp.Or, children: [left, right] };
      }
    }

    return left;
  }

  /**
   * Parse AND expressions.
   */
  private parseAnd(): Expression {
    let left = this.parseNot();

    while (this.peek().type === TokenType.And) {
      this.advance();
      const right = this.parseNot();
      if (left.type === ExpressionType.Logical && left.op === LogicalOp.And) {
        left.children.push(right);
      } else {
        left = { type: ExpressionType.Logical, op: LogicalOp.And, children: [left, right] };
      }
    }

    return left;
  }

  /**
   * Parse NOT prefix.
   */
  private parseNot(): Expression {
    if (this.peek().type === TokenType.Not) {
      this.advance();
      const child = this.parseNot();
      return { type: ExpressionType.Not, child };
    }
    return this.parsePrimary();
  }

  /**
   * Parse primary expressions: comparisons, LIKE, IN, BETWEEN, IS NULL, parenthesized groups.
   */
  private parsePrimary(): Expression {
    // Parenthesized group
    if (this.peek().type === TokenType.LeftParen) {
      this.advance();
      const expr = this.parseOr();
      this.expect(TokenType.RightParen);
      return expr;
    }

    // Must be an identifier (field name)
    if (this.peek().type !== TokenType.Ident) {
      throw new Error(`Unexpected token '${this.peek().value}' at position ${this.peek().pos}`);
    }

    const fieldToken = this.advance();
    const fieldName = fieldToken.value;
    const next = this.peek();

    // IS [NOT] NULL
    if (next.type === TokenType.Is) {
      this.advance();
      const notToken = this.match(TokenType.Not);
      this.expect(TokenType.Null);
      return { type: ExpressionType.IsNull, field: fieldName, not: Boolean(notToken) };
    }

    // [NOT] LIKE
    if (next.type === TokenType.Like) {
      this.advance();
      const pattern = this.expect(TokenType.String).value;
      return { type: ExpressionType.Like, field: fieldName, pattern };
    }
    if (next.type === TokenType.Not) {
      const savedPos = this.pos;
      this.advance();
      if (this.peek().type === TokenType.Like) {
        this.advance();
        const pattern = this.expect(TokenType.String).value;
        return { type: ExpressionType.Like, field: fieldName, pattern, not: true };
      }
      if (this.peek().type === TokenType.In) {
        this.advance();
        return this.parseInList(fieldName, true);
      }
      if (this.peek().type === TokenType.Between) {
        this.advance();
        return this.parseBetweenValues(fieldName, true);
      }
      // Backtrack — NOT was not part of a LIKE/IN/BETWEEN
      this.pos = savedPos;
    }

    // IN (value list)
    if (next.type === TokenType.In) {
      this.advance();
      return this.parseInList(fieldName, false);
    }

    // BETWEEN
    if (next.type === TokenType.Between) {
      this.advance();
      return this.parseBetweenValues(fieldName, false);
    }

    // Comparison operator
    if (next.type === TokenType.Operator) {
      this.advance();
      const value = this.parseLiteral();
      return {
        type: ExpressionType.Comparison,
        field: fieldName,
        op: next.value as ComparisonOp,
        value
      };
    }

    throw new Error(`Unexpected token '${next.value}' after field '${fieldName}' at position ${next.pos}`);
  }

  private parseInList(fieldName: string, not: boolean): Expression {
    this.expect(TokenType.LeftParen);
    const values: LiteralValue[] = [];
    values.push(this.parseLiteral());
    while (this.match(TokenType.Comma)) {
      values.push(this.parseLiteral());
    }
    this.expect(TokenType.RightParen);
    return { type: ExpressionType.In, field: fieldName, values, not: not || undefined };
  }

  private parseBetweenValues(fieldName: string, not: boolean): Expression {
    const low = this.parseLiteral();
    this.expect(TokenType.And);
    const high = this.parseLiteral();
    return { type: ExpressionType.Between, field: fieldName, low, high, not: not || undefined };
  }
}

/**
 * Parse an Esri SQL-92 WHERE clause string into an Expression AST.
 *
 * Falls back to a RawExpr for input that cannot be parsed, rather than throwing.
 *
 * @example
 * ```ts
 * parse("type = 'building' AND status = 'active'")
 * // → LogicalExpr { op: 'AND', children: [ComparisonExpr, ComparisonExpr] }
 *
 * parse("some_unsupported_syntax()")
 * // → RawExpr { sql: "some_unsupported_syntax()" }
 * ```
 */
export function parse(sql: string): Expression {
  const trimmed = sql.trim();
  if (!trimmed) {
    return { type: ExpressionType.Raw, sql: '' } satisfies RawExpr;
  }

  try {
    const tokens = new Tokenizer(trimmed).tokenize();
    const parser = new Parser(tokens);
    const expr = parser.parseOr();

    // Ensure we consumed all tokens
    if (!parser.isAtEnd()) {
      return { type: ExpressionType.Raw, sql: trimmed };
    }

    return expr;
  } catch {
    // Fall back to raw expression on any parse error
    return { type: ExpressionType.Raw, sql: trimmed };
  }
}
