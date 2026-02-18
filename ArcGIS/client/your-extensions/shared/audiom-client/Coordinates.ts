/**
 * Interface for a geographic coordinate
 */
export interface ICoordinates {
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
 * Represents a geographic coordinates with longitude and latitude.
 *
 * String format: "longitude,latitude" (e.g., "-122.4194,37.7749")
 */
export class Coordinates implements ICoordinates {
  longitude: number;
  latitude: number;

  constructor(longitude: number, latitude: number) {
    this.longitude = longitude;
    this.latitude = latitude;
  }

  /**
   * Create a Coordinates from an ICoordinates interface
   */
  static from(coord: ICoordinates): Coordinates {
    return new Coordinates(coord.longitude, coord.latitude);
  }

  /**
   * Create a Coordinates from a [longitude, latitude] array
   */
  static fromArray(arr: number[]): Coordinates {
    if (arr.length < 2) {
      throw new Error('Coordinates array must have at least 2 elements [longitude, latitude]');
    }
    return new Coordinates(arr[0], arr[1]);
  }

  /**
   * Parse a Coordinates from a string in the format "longitude,latitude"
   */
  static parse(str: string): Coordinates {
    const parts = str.split(',').map(s => s.trim());
    if (parts.length !== 2) {
      throw new Error(`Invalid coordinates format: "${str}". Expected "longitude,latitude"`);
    }
    const longitude = parseFloat(parts[0]);
    const latitude = parseFloat(parts[1]);
    if (isNaN(longitude) || isNaN(latitude)) {
      throw new Error(`Invalid coordinates values: "${str}". Values must be numeric`);
    }
    return new Coordinates(longitude, latitude);
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
   * Check equality with another coordinates
   */
  equals(other: Coordinates): boolean {
    return this.longitude === other.longitude && this.latitude === other.latitude;
  }
}
