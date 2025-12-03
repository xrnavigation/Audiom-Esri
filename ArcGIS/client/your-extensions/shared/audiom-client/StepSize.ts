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
}
