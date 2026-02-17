import { Coordinate, ICoordinate } from './Coordinate';

/**
 * Interface for a geographic quadrilateral defined by 4 corner coordinates
 */
export interface IGeoQuad {
  /**
   * Top-left corner
   */
  topLeft: ICoordinate;

  /**
   * Top-right corner
   */
  topRight: ICoordinate;

  /**
   * Bottom-right corner
   */
  bottomRight: ICoordinate;

  /**
   * Bottom-left corner
   */
  bottomLeft: ICoordinate;
}

/**
 * Represents a geographic quadrilateral defined by 4 corner coordinates.
 * 
 * String format: JSON array of arrays "[[lng,lat],[lng,lat],[lng,lat],[lng,lat]]"
 * Order: top-left, top-right, bottom-right, bottom-left
 */
export class GeoQuad implements IGeoQuad {
  topLeft: Coordinate;
  topRight: Coordinate;
  bottomRight: Coordinate;
  bottomLeft: Coordinate;

  constructor(topLeft: Coordinate, topRight: Coordinate, bottomRight: Coordinate, bottomLeft: Coordinate) {
    this.topLeft = topLeft;
    this.topRight = topRight;
    this.bottomRight = bottomRight;
    this.bottomLeft = bottomLeft;
  }

  /**
   * Create a GeoQuad from an IGeoQuad interface
   */
  static from(quad: IGeoQuad): GeoQuad {
    return new GeoQuad(
      Coordinate.from(quad.topLeft),
      Coordinate.from(quad.topRight),
      Coordinate.from(quad.bottomRight),
      Coordinate.from(quad.bottomLeft)
    );
  }

  /**
   * Create a GeoQuad from a number[][] array
   * Expected format: [[lng,lat], [lng,lat], [lng,lat], [lng,lat]]
   * Order: top-left, top-right, bottom-right, bottom-left
   */
  static fromArray(arr: number[][]): GeoQuad {
    if (arr.length !== 4) {
      throw new Error(`GeoQuad requires exactly 4 coordinates, got ${arr.length}`);
    }
    return new GeoQuad(
      Coordinate.fromArray(arr[0]),
      Coordinate.fromArray(arr[1]),
      Coordinate.fromArray(arr[2]),
      Coordinate.fromArray(arr[3])
    );
  }

  /**
   * Parse a GeoQuad from a JSON string.
   * Accepts format: "[[lng,lat],[lng,lat],[lng,lat],[lng,lat]]"
   */
  static parse(str: string): GeoQuad {
    let cleaned = str.trim();

    try {
      const arr = JSON.parse(cleaned);
      if (!Array.isArray(arr) || arr.length !== 4) {
        throw new Error('Expected an array of 4 coordinate pairs');
      }
      return GeoQuad.fromArray(arr);
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new Error(`Invalid GeoQuad format: "${str}". Expected JSON array of 4 coordinate pairs`);
      }
      throw e;
    }
  }

  /**
   * Convert to a number[][] array
   * Order: top-left, top-right, bottom-right, bottom-left
   */
  toArray(): number[][] {
    return [
      this.topLeft.toArray(),
      this.topRight.toArray(),
      this.bottomRight.toArray(),
      this.bottomLeft.toArray()
    ];
  }

  /**
   * Convert to JSON string format "[[lng,lat],[lng,lat],[lng,lat],[lng,lat]]"
   */
  toString(): string {
    return JSON.stringify(this.toArray());
  }

  /**
   * Get all 4 corner coordinates as an array
   * Order: top-left, top-right, bottom-right, bottom-left
   */
  getCoordinates(): [Coordinate, Coordinate, Coordinate, Coordinate] {
    return [this.topLeft, this.topRight, this.bottomRight, this.bottomLeft];
  }

  /**
   * Check equality with another GeoQuad
   */
  equals(other: GeoQuad): boolean {
    return (
      this.topLeft.equals(other.topLeft) &&
      this.topRight.equals(other.topRight) &&
      this.bottomRight.equals(other.bottomRight) &&
      this.bottomLeft.equals(other.bottomLeft)
    );
  }
}
