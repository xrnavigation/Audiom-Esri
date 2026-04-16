/**
 * Overpass API proximity (around) filter.
 *
 * Constrains results to features within a radius of a point, or within
 * a radius of elements from a preceding input set.
 *
 * @see https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL#Around
 */

export class OverpassAroundFilter {
  readonly radius: number;
  readonly lat?: number;
  readonly lon?: number;

  private constructor(radius: number, lat?: number, lon?: number) {
    this.radius = radius;
    this.lat = lat;
    this.lon = lon;
  }

  /**
   * Create a proximity filter around a specific point.
   *
   * @param radius - Search radius in meters.
   * @param lat - Latitude of center point.
   * @param lon - Longitude of center point.
   */
  static aroundPoint(radius: number, lat: number, lon: number): OverpassAroundFilter {
    return new OverpassAroundFilter(radius, lat, lon);
  }

  /**
   * Create a proximity filter around elements from the input set.
   * Used when chaining Overpass queries — the radius is applied
   * relative to results from the preceding statement.
   *
   * @param radius - Search radius in meters.
   */
  static aroundSet(radius: number): OverpassAroundFilter {
    return new OverpassAroundFilter(radius);
  }

  /**
   * Serialize to Overpass QL `(around:...)` filter syntax.
   */
  toOverpassFilter(): string {
    if (this.lat !== undefined && this.lon !== undefined) {
      return `(around:${this.radius},${this.lat},${this.lon})`;
    }
    return `(around:${this.radius})`;
  }
}
