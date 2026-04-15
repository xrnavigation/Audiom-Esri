/**
 * Vendor-neutral date/time filter types with serialization to
 * OGC API `datetime` parameter, Overpass date settings, and
 * RFC 3339 strings.
 *
 * @see https://docs.ogc.org/is/17-069r4/17-069r4.html#_parameter_datetime
 * @see https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL#date
 */

// ── Helpers ─────────────────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Format a Date as an RFC 3339 / ISO 8601 UTC string.
 */
export function toRfc3339(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const MM = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const HH = pad(date.getUTCHours());
  const mm = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());
  return `${yyyy}-${MM}-${dd}T${HH}:${mm}:${ss}Z`;
}

// ── DateTimeInstant ─────────────────────────────────────────────────

/**
 * A vendor-neutral instant in time.
 */
export class DateTimeInstant {
  readonly date: Date;

  private constructor(date: Date) {
    this.date = date;
  }

  static fromDate(date: Date): DateTimeInstant {
    return new DateTimeInstant(new Date(date.getTime()));
  }

  static fromIsoString(iso: string): DateTimeInstant {
    return new DateTimeInstant(new Date(iso));
  }

  /**
   * Serialize to RFC 3339 format: `2018-02-12T23:20:52Z`
   */
  toRfc3339(): string {
    return toRfc3339(this.date);
  }

  /**
   * Serialize to Overpass `[date:"..."]` setting.
   */
  toOverpassDateSetting(): string {
    return `[date:"${toRfc3339(this.date)}"]`;
  }
}

// ── DateTimeInterval ────────────────────────────────────────────────

/**
 * A vendor-neutral time interval with optional open bounds.
 * `null` start means "from the beginning of time" (`..` in OGC).
 * `null` end means "up to the present" (`..` in OGC).
 */
export class DateTimeInterval {
  readonly start: Date | null;
  readonly end: Date | null;

  private constructor(start: Date | null, end: Date | null) {
    this.start = start ? new Date(start.getTime()) : null;
    this.end = end ? new Date(end.getTime()) : null;
  }

  static create(start: Date | null, end: Date | null): DateTimeInterval {
    return new DateTimeInterval(start, end);
  }

  /**
   * Serialize to OGC `datetime` parameter format.
   * Closed: `start/end`
   * Open start: `../end`
   * Open end: `start/..`
   */
  toOgcDateTimeParam(): string {
    const startStr = this.start ? toRfc3339(this.start) : '..';
    const endStr = this.end ? toRfc3339(this.end) : '..';
    return `${startStr}/${endStr}`;
  }

  /**
   * Serialize to Overpass `[diff:"start","end"]` setting for change queries.
   */
  toOverpassDiffSetting(): string {
    if (!this.start) {
      throw new Error('Overpass diff requires a start date');
    }
    const startStr = toRfc3339(this.start);
    if (this.end) {
      return `[diff:"${startStr}","${toRfc3339(this.end)}"]`;
    }
    return `[diff:"${startStr}"]`;
  }
}
