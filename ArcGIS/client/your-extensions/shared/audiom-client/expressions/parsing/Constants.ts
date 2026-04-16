/**
 * Shared constants for SQL tokenization and parsing.
 */

// ── Token types ─────────────────────────────────────────────────────

export enum TokenType {
  String = 'STRING',
  Number = 'NUMBER',
  Null = 'NULL',
  Timestamp = 'TIMESTAMP',
  Ident = 'IDENT',
  LeftParen = 'LPAREN',
  RightParen = 'RPAREN',
  Comma = 'COMMA',
  Operator = 'OP',
  And = 'AND',
  Or = 'OR',
  Not = 'NOT',
  Like = 'LIKE',
  In = 'IN',
  Between = 'BETWEEN',
  Is = 'IS',
  Eof = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

// ── SQL keyword mappings ────────────────────────────────────────────

/** SQL keywords mapped to their token types. */
export const KEYWORD_TOKENS: ReadonlyMap<string, TokenType> = new Map([
  ['AND', TokenType.And],
  ['OR', TokenType.Or],
  ['NOT', TokenType.Not],
  ['LIKE', TokenType.Like],
  ['IN', TokenType.In],
  ['BETWEEN', TokenType.Between],
  ['IS', TokenType.Is],
  ['NULL', TokenType.Null],
]);

export const TIMESTAMP_KEYWORD = 'TIMESTAMP';

/** Two-character operators mapped to their canonical SQL form. */
export const TWO_CHAR_OPERATORS: ReadonlyMap<string, string> = new Map([
  ['<>', '<>'],
  ['<=', '<='],
  ['>=', '>='],
  ['!=', '<>'],
]);

/** Single-character comparison operators. */
export const SINGLE_CHAR_OPERATORS = new Set(['=', '<', '>']);

/** Single-character punctuation mapped to token types. */
export const PUNCTUATION_TOKENS: ReadonlyMap<string, TokenType> = new Map([
  ['(', TokenType.LeftParen],
  [')', TokenType.RightParen],
  [',', TokenType.Comma],
]);

// ── Character-class regex patterns ──────────────────────────────────

/** Matches a single whitespace character. */
export const WHITESPACE_PATTERN = /\s/;

/** Matches a digit character (0-9). */
export const DIGIT_PATTERN = /[0-9]/;

/** Matches a digit or decimal-point character. */
export const DIGIT_OR_DOT_PATTERN = /[0-9.]/;

/** Matches a valid first character of an SQL identifier (letter or underscore). */
export const WORD_START_PATTERN = /[a-zA-Z_]/;

/** Matches subsequent characters of an SQL identifier (letter, digit, or underscore). */
export const WORD_CHAR_PATTERN = /[a-zA-Z0-9_]/;
