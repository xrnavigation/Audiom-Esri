/**
 * Interface for a geographic coordinate
 */
export interface ICoordinate {
  /**
   * Longitude (x-coordinate)
   */
  longitude: number;

  /**
   * Latitude (y-coordinate)
   */
  latitude: number;
}

/**
 * Represents a geographic coordinate with longitude and latitude.
 *
 * String format: "longitude,latitude" (e.g., "-122.4194,37.7749")
 */
export class Coordinate implements ICoordinate {
  longitude: number;
  latitude: number;

  constructor(longitude: number, latitude: number) {
    this.longitude = longitude;
    this.latitude = latitude;
  }

  /**
   * Create a Coordinate from an ICoordinate interface
   */
  static from(coord: ICoordinate): Coordinate {
    return new Coordinate(coord.longitude, coord.latitude);
  }

  /**
   * Create a Coordinate from a [longitude, latitude] array
   */
  static fromArray(arr: number[]): Coordinate {
    if (arr.length < 2) {
      throw new Error('Coordinate array must have at least 2 elements [longitude, latitude]');
    }
    return new Coordinate(arr[0], arr[1]);
  }

  /**
   * Parse a coordinate from a string in the format "longitude,latitude"
   */
  static parse(str: string): Coordinate {
    const parts = str.split(',').map(s => s.trim());
    if (parts.length !== 2) {
      throw new Error(`Invalid coordinate format: "${str}". Expected "longitude,latitude"`);
    }
    const longitude = parseFloat(parts[0]);
    const latitude = parseFloat(parts[1]);
    if (isNaN(longitude) || isNaN(latitude)) {
      throw new Error(`Invalid coordinate values: "${str}". Values must be numeric`);
    }
    return new Coordinate(longitude, latitude);
  }

  /**
   * Convert to [longitude, latitude] array
   */
  toArray(): [number, number] {
    return [this.longitude, this.latitude];
  }

  /**
   * Convert to string format "longitude,latitude"
   */
  toString(): string {
    return `${this.longitude},${this.latitude}`;
  }

  /**
   * Check equality with another coordinate
   */
  equals(other: Coordinate): boolean {
    return this.longitude === other.longitude && this.latitude === other.latitude;
  }
}
