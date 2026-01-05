/**
 * Step size units for navigation/movement in the audio map
 */
export enum StepSizeUnit {
  Kilometers = 'km',
  Meters = 'm',
  Miles = 'mi',
  Feet = 'ft'
}

/**
 * Conversion factors from each unit to meters
 */
const METERS_PER_UNIT: Record<StepSizeUnit, number> = {
  [StepSizeUnit.Meters]: 1,
  [StepSizeUnit.Kilometers]: 1000,
  [StepSizeUnit.Miles]: 1609.34,
  [StepSizeUnit.Feet]: 0.3048
};

/**
 * Represents a step size with value and unit
 */
export interface IStepSize {
  value: number;
  unit: StepSizeUnit;
}

/**
 * Step size configuration for Audiom navigation
 */
export class StepSize implements IStepSize {
  value: number;
  unit: StepSizeUnit;

  private constructor(value: number, unit: StepSizeUnit) {
    if (value <= 0) {
      throw new Error('Step size value must be positive');
    }
    this.value = value;
    this.unit = unit;
  }

  /**
   * Create a step size in kilometers
   */
  static Kilometers(value: number): StepSize {
    return new StepSize(value, StepSizeUnit.Kilometers);
  }

  /**
   * Create a step size in meters
   */
  static Meters(value: number): StepSize {
    return new StepSize(value, StepSizeUnit.Meters);
  }

  /**
   * Create a step size in miles
   */
  static Miles(value: number): StepSize {
    return new StepSize(value, StepSizeUnit.Miles);
  }

  /**
   * Create a step size in feet
   */
  static Feet(value: number): StepSize {
    return new StepSize(value, StepSizeUnit.Feet);
  }

  /**
   * Parse a step size string (e.g., "10m", "5km", "100")
   * Defaults to meters if no unit is specified
   */
  static parse(stepSizeString: string): StepSize {
    const match = stepSizeString.match(/^(\d+(?:\.\d+)?)(km|m|mi|ft)?$/);
    if (!match) {
      throw new Error(`Invalid step size format: ${stepSizeString}`);
    }

    const value = parseFloat(match[1]);
    const unit = (match[2] as StepSizeUnit) || StepSizeUnit.Meters;

    return new StepSize(value, unit);
  }

  /**
   * Convert to string format for URL parameter
   */
  toString(): string {
    return `${this.value}${this.unit}`;
  }

  /**
   * Convert to a different unit
   */
  convertTo(targetUnit: StepSizeUnit): StepSize {
    if (this.unit === targetUnit) {
      return new StepSize(this.value, this.unit);
    }

    // Convert through meters: source -> meters -> target
    const valueInMeters = this.value * METERS_PER_UNIT[this.unit];
    const convertedValue = valueInMeters / METERS_PER_UNIT[targetUnit];

    return new StepSize(convertedValue, targetUnit);
  }

  /**
   * Convert to meters and return the numeric value
   */
  toMeters(): StepSize {
    return this.convertTo(StepSizeUnit.Meters);
  }

  /**
   * Convert to kilometers and return the numeric value
   */
  toKilometers(): StepSize {
    return this.convertTo(StepSizeUnit.Kilometers);
  }

  /**
   * Convert to miles and return the numeric value
   */
  toMiles(): StepSize {
    return this.convertTo(StepSizeUnit.Miles);
  }

  /**
   * Convert to feet and return the numeric value
   */
  toFeet(): StepSize {
    return this.convertTo(StepSizeUnit.Feet);
  }
}
