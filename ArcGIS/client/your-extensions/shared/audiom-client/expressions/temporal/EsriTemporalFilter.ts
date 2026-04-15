/**
 * Typed temporal filter for Esri feature service queries.
 *
 * Supports time instants, time extents (ranges), and SQL INTERVAL expressions
 * for relative date/time queries using CURRENT_TIMESTAMP.
 *
 * @see https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/
 * @see https://www.esri.com/arcgis-blog/products/api-rest/data-management/querying-feature-services-date-time-queries/
 */

// ── Interval units for CURRENT_TIMESTAMP +/- INTERVAL syntax ────────

export enum IntervalUnit {
  Day = 'DAY',
  Hour = 'HOUR',
  Minute = 'MINUTE',
  Second = 'SECOND'
}

// ── Compound interval units ─────────────────────────────────────────

export enum CompoundIntervalUnit {
  DayToHour = 'DAY TO HOUR',
  DayToMinute = 'DAY TO MINUTE',
  DayToSecond = 'DAY TO SECOND',
  HourToMinute = 'HOUR TO MINUTE',
  HourToSecond = 'HOUR TO SECOND',
  MinuteToSecond = 'MINUTE TO SECOND'
}

// ── Time instant ────────────────────────────────────────────────────

/**
 * A point in time, stored as epoch milliseconds.
 */
export class TimeInstant {
  readonly epochMs: number;

  private constructor(epochMs: number) {
    this.epochMs = epochMs;
  }

  static fromEpochMs(ms: number): TimeInstant {
    return new TimeInstant(ms);
  }

  static fromDate(date: Date): TimeInstant {
    return new TimeInstant(date.getTime());
  }

  /**
   * Serialize for the Esri `time=` query parameter.
   */
  toQueryParam(): string {
    return String(this.epochMs);
  }

  /**
   * Format as an Esri SQL TIMESTAMP literal for use in WHERE clauses.
   * Output: `TIMESTAMP 'yyyy-MM-dd HH:mm:ss'`
   */
  toTimestampLiteral(): string {
    const d = new Date(this.epochMs);
    const pad = (n: number, len = 2) => String(n).padStart(len, '0');
    const yyyy = d.getUTCFullYear();
    const MM = pad(d.getUTCMonth() + 1);
    const dd = pad(d.getUTCDate());
    const HH = pad(d.getUTCHours());
    const mm = pad(d.getUTCMinutes());
    const ss = pad(d.getUTCSeconds());
    return `TIMESTAMP '${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}'`;
  }
}

// ── Time extent (range) ─────────────────────────────────────────────

/**
 * A time range with optional open ends.
 * `null` for start means "from the beginning of time."
 * `null` for end means "to the present."
 */
export class TimeExtent {
  readonly start: TimeInstant | null;
  readonly end: TimeInstant | null;

  private constructor(start: TimeInstant | null, end: TimeInstant | null) {
    this.start = start;
    this.end = end;
  }

  static create(start: TimeInstant | null, end: TimeInstant | null): TimeExtent {
    return new TimeExtent(start, end);
  }

  static fromEpochMs(startMs: number | null, endMs: number | null): TimeExtent {
    return new TimeExtent(
      startMs !== null ? TimeInstant.fromEpochMs(startMs) : null,
      endMs !== null ? TimeInstant.fromEpochMs(endMs) : null
    );
  }

  static fromDates(start: Date | null, end: Date | null): TimeExtent {
    return new TimeExtent(
      start ? TimeInstant.fromDate(start) : null,
      end ? TimeInstant.fromDate(end) : null
    );
  }

  /**
   * Serialize for the Esri `time=` query parameter.
   * Format: `<startTime>,<endTime>` — null values become `null`.
   */
  toQueryParam(): string {
    const queryStart = this.start ? this.start.toQueryParam() : 'null';
    const queryEnd = this.end ? this.end.toQueryParam() : 'null';
    return `${queryStart},${queryEnd}`;
  }
}

// ── Interval expression for WHERE clause relative queries ───────────

/**
 * Represents a SQL INTERVAL expression for relative date queries.
 *
 * Usage in WHERE clauses:
 * ```sql
 * DateField >= CURRENT_TIMESTAMP - INTERVAL '3' DAY
 * DateField >= CURRENT_TIMESTAMP - INTERVAL '3 05:32:28' DAY TO SECOND
 * ```
 */
export interface IntervalExpression {
  value: string;
  unit: IntervalUnit | CompoundIntervalUnit;
}

/**
 * Create an INTERVAL expression for use in WHERE clause date/time queries.
 *
 * @example
 * ```ts
 * interval('3', IntervalUnit.Day)
 * // produces: INTERVAL '3' DAY
 *
 * interval('3 05:32:28', CompoundIntervalUnit.DayToSecond)
 * // produces: INTERVAL '3 05:32:28' DAY TO SECOND
 * ```
 */
export function interval(value: string, unit: IntervalUnit | CompoundIntervalUnit): IntervalExpression {
  return { value, unit };
}

/**
 * Serialize an IntervalExpression to an Esri SQL fragment.
 */
export function intervalToString(expr: IntervalExpression): string {
  return `INTERVAL '${expr.value}' ${expr.unit}`;
}
