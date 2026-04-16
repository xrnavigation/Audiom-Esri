/**
 * SQL-92 tokenizer for Esri WHERE clause expressions.
 */

import {
  Token,
  TokenType,
  KEYWORD_TOKENS,
  TIMESTAMP_KEYWORD,
  TWO_CHAR_OPERATORS,
  SINGLE_CHAR_OPERATORS,
  PUNCTUATION_TOKENS,
  WHITESPACE_PATTERN,
  DIGIT_PATTERN,
  DIGIT_OR_DOT_PATTERN,
  WORD_START_PATTERN,
  WORD_CHAR_PATTERN,
} from './Constants';

export class Tokenizer {
  private readonly input: string;
  private pos = 0;

  constructor(input: string) {
    this.input = input;
  }

  private tokens: Token[] = [];

  tokenize(): Token[] {
    this.tokens = [];

    while (this.pos < this.input.length) {
      this.skipWhitespace();
      if (this.pos >= this.input.length) break;

      const token = this.readNextToken();
      if (token) {
        this.tokens.push(token);
      }
    }

    this.tokens.push({ type: TokenType.Eof, value: '', pos: this.input.length });
    return this.tokens;
  }

  private previousTokenType(): TokenType | null {
    return this.tokens.length > 0 ? this.tokens[this.tokens.length - 1].type : null;
  }

  private peek(): string {
    return this.input[this.pos];
  }

  private peekAt(offset: number): string | undefined {
    return this.input[this.pos + offset];
  }

  private advance(): string {
    return this.input[this.pos++];
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && WHITESPACE_PATTERN.test(this.input[this.pos])) {
      ++this.pos;
    }
  }

  private readNextToken(): Token | null {
    const startPos = this.pos;
    const char = this.peek();

    if (char === "'") return this.readStringLiteral(startPos);

    const punctuation = PUNCTUATION_TOKENS.get(char);
    if (punctuation) {
      this.advance();
      return { type: punctuation, value: char, pos: startPos };
    }

    const operator = this.tryReadOperator(startPos);
    if (operator) return operator;

    if (this.isNumberStart()) return this.readNumberLiteral(startPos);
    if (WORD_START_PATTERN.test(char)) return this.readWord(startPos);

    // Skip unknown characters
    this.advance();
    return null;
  }

  private readStringLiteral(startPos: number): Token {
    const singleQuote = "'";
    this.advance(); // skip opening quote
    let value = '';
    while (this.pos < this.input.length) {
      if (this.peek() === singleQuote && this.peekAt(1) === singleQuote) {
        value += singleQuote;
        this.pos += 2;
      } else if (this.peek() === singleQuote) {
        this.advance(); // skip closing quote
        break;
      } else {
        value += this.advance();
      }
    }
    return { type: TokenType.String, value, pos: startPos };
  }

  private tryReadOperator(startPos: number): Token | null {
    // Try two-character operators first
    if (this.pos + 1 < this.input.length) {
      const twoCharSlice = this.input.slice(this.pos, this.pos + 2);
      const canonical = TWO_CHAR_OPERATORS.get(twoCharSlice);
      if (canonical) {
        this.pos += 2;
        return { type: TokenType.Operator, value: canonical, pos: startPos };
      }
    }

    // Try single-character operators
    if (SINGLE_CHAR_OPERATORS.has(this.peek())) {
      const value = this.advance();
      return { type: TokenType.Operator, value, pos: startPos };
    }

    return null;
  }

  private isNumberStart(): boolean {
    const char = this.peek();
    const negativeSign = '-';
    if (DIGIT_PATTERN.test(char)) return true;
    // Only treat '-' as a negative sign when preceded by an operator, opening
    // paren, comma, or at the very start of the input — never immediately
    // after an identifier or number (e.g. "x >-5" should tokenize as '>' then '-5',
    // but "x-5" should not swallow the '-5' as a standalone negative number).
    if (char === negativeSign && this.peekAt(1) !== undefined && DIGIT_PATTERN.test(this.peekAt(1)!)) {
      const prev = this.previousTokenType();
      return prev === null || prev === TokenType.Operator || prev === TokenType.LeftParen || prev === TokenType.Comma;
    }
    return false;
  }

  private readNumberLiteral(startPos: number): Token {
    const negativeSign = '-';
    let value = '';
    if (this.peek() === negativeSign) {
      value += this.advance();
    }
    while (this.pos < this.input.length && DIGIT_OR_DOT_PATTERN.test(this.peek())) {
      value += this.advance();
    }
    return { type: TokenType.Number, value, pos: startPos };
  }

  private readWord(startPos: number): Token {
    let word = '';
    while (this.pos < this.input.length && WORD_CHAR_PATTERN.test(this.peek())) {
      word += this.advance();
    }

    const upper = word.toUpperCase();

    // TIMESTAMP is special: consumes the following string literal
    if (upper === TIMESTAMP_KEYWORD) {
      return this.readTimestampOrIdent(word, startPos);
    }

    // Check if the word is a recognized SQL keyword
    const keywordType = KEYWORD_TOKENS.get(upper);
    if (keywordType) {
      return { type: keywordType, value: upper, pos: startPos };
    }

    return { type: TokenType.Ident, value: word, pos: startPos };
  }

  private readTimestampOrIdent(word: string, startPos: number): Token {
    const singleQuote = "'";
    this.skipWhitespace();
    if (this.pos < this.input.length && this.peek() === singleQuote) {
      this.advance(); // skip opening quote
      let timestamp = '';
      while (this.pos < this.input.length && this.peek() !== singleQuote) {
        timestamp += this.advance();
      }
      if (this.pos < this.input.length) {
        this.advance(); // skip closing quote
      }
      return { type: TokenType.Timestamp, value: timestamp, pos: startPos };
    }

    // Not followed by a string literal — treat as identifier
    return { type: TokenType.Ident, value: word, pos: startPos };
  }
}
