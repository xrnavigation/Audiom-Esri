import { describe, it, expect } from 'vitest';
import { StepSize, StepSizeUnit } from './StepSize';

describe('StepSize', () => {
  describe('Factory Methods', () => {
    it('should create StepSize from meters', () => {
      const stepSize = StepSize.meters(100);
      expect(stepSize.value).toBe(100);
      expect(stepSize.unit).toBe(StepSizeUnit.Meters);
      expect(stepSize.toString()).toBe('100m');
    });

    it('should create StepSize from feet', () => {
      const stepSize = StepSize.feet(100);
      expect(stepSize.value).toBe(100);
      expect(stepSize.unit).toBe(StepSizeUnit.Feet);
      expect(stepSize.toString()).toBe('100ft');
    });

    it('should create StepSize from miles', () => {
      const stepSize = StepSize.miles(1);
      expect(stepSize.value).toBe(1);
      expect(stepSize.unit).toBe(StepSizeUnit.Miles);
      expect(stepSize.toString()).toBe('1mi');
    });

    it('should create StepSize from kilometers', () => {
      const stepSize = StepSize.kilometers(2);
      expect(stepSize.value).toBe(2);
      expect(stepSize.unit).toBe(StepSizeUnit.Kilometers);
      expect(stepSize.toString()).toBe('2km');
    });

    it('should create StepSize with decimal values', () => {
      const stepSize = StepSize.meters(0.5);
      expect(stepSize.value).toBe(0.5);
      expect(stepSize.unit).toBe(StepSizeUnit.Meters);
    });
  });

  describe('create', () => {
    it('should create StepSize with specified value and unit', () => {
      const stepSize = StepSize.create(100, StepSizeUnit.Meters);
      expect(stepSize.value).toBe(100);
      expect(stepSize.unit).toBe(StepSizeUnit.Meters);
    });

    it('should create StepSize for each unit type', () => {
      expect(StepSize.create(1, StepSizeUnit.Kilometers).unit).toBe(StepSizeUnit.Kilometers);
      expect(StepSize.create(1, StepSizeUnit.Meters).unit).toBe(StepSizeUnit.Meters);
      expect(StepSize.create(1, StepSizeUnit.Miles).unit).toBe(StepSizeUnit.Miles);
      expect(StepSize.create(1, StepSizeUnit.Feet).unit).toBe(StepSizeUnit.Feet);
    });
  });

  describe('validation', () => {
    it('should throw error for zero value', () => {
      expect(() => StepSize.meters(0)).toThrow('Step size value must be positive');
    });

    it('should throw error for negative value', () => {
      expect(() => StepSize.meters(-10)).toThrow('Step size value must be positive');
    });

    it('should throw error for negative value via create', () => {
      expect(() => StepSize.create(-5, StepSizeUnit.Feet)).toThrow('Step size value must be positive');
    });

    it('should throw error for zero value via each factory method', () => {
      expect(() => StepSize.kilometers(0)).toThrow('Step size value must be positive');
      expect(() => StepSize.miles(0)).toThrow('Step size value must be positive');
      expect(() => StepSize.feet(0)).toThrow('Step size value must be positive');
    });
  });

  describe('parse', () => {
    it('should parse step size string with unit', () => {
      expect(StepSize.parse('100m').toString()).toBe('100m');
      expect(StepSize.parse('50ft').toString()).toBe('50ft');
      expect(StepSize.parse('2mi').toString()).toBe('2mi');
      expect(StepSize.parse('3km').toString()).toBe('3km');
    });

    it('should parse decimal values', () => {
      const stepSize = StepSize.parse('50.5m');
      expect(stepSize.value).toBe(50.5);
      expect(stepSize.unit).toBe(StepSizeUnit.Meters);
    });

    it('should parse decimal values with different units', () => {
      expect(StepSize.parse('1.5km').value).toBe(1.5);
      expect(StepSize.parse('1.5km').unit).toBe(StepSizeUnit.Kilometers);
      expect(StepSize.parse('0.25mi').value).toBe(0.25);
      expect(StepSize.parse('0.25mi').unit).toBe(StepSizeUnit.Miles);
    });

    it('should default to meters when no unit specified', () => {
      const stepSize = StepSize.parse('100');
      expect(stepSize.unit).toBe(StepSizeUnit.Meters);
      expect(stepSize.value).toBe(100);
    });

    it('should throw error for invalid format', () => {
      expect(() => StepSize.parse('invalid')).toThrow('Invalid step size format');
    });

    it('should throw error for empty string', () => {
      expect(() => StepSize.parse('')).toThrow('Invalid step size format');
    });

    it('should throw error for negative values', () => {
      expect(() => StepSize.parse('-10m')).toThrow('Invalid step size format');
    });

    it('should throw error for string with spaces', () => {
      expect(() => StepSize.parse('10 m')).toThrow('Invalid step size format');
    });
  });

  describe('convertTo', () => {
    it('should convert meters to kilometers', () => {
      const stepSize = StepSize.meters(1500);
      const converted = stepSize.convertTo(StepSizeUnit.Kilometers);
      expect(converted.value).toBe(1.5);
      expect(converted.unit).toBe(StepSizeUnit.Kilometers);
    });

    it('should convert kilometers to meters', () => {
      const stepSize = StepSize.kilometers(2);
      const converted = stepSize.convertTo(StepSizeUnit.Meters);
      expect(converted.value).toBe(2000);
    });

    it('should convert miles to meters', () => {
      const stepSize = StepSize.miles(1);
      const converted = stepSize.convertTo(StepSizeUnit.Meters);
      expect(converted.value).toBeCloseTo(1609.34, 2);
    });

    it('should convert feet to meters', () => {
      const stepSize = StepSize.feet(100);
      const converted = stepSize.convertTo(StepSizeUnit.Meters);
      expect(converted.value).toBeCloseTo(30.48, 2);
    });

    it('should return same unit when converting to same unit', () => {
      const stepSize = StepSize.meters(100);
      const converted = stepSize.convertTo(StepSizeUnit.Meters);
      expect(converted.value).toBe(100);
      expect(converted.unit).toBe(StepSizeUnit.Meters);
    });

    it('should convert miles to feet', () => {
      const stepSize = StepSize.miles(1);
      const converted = stepSize.convertTo(StepSizeUnit.Feet);
      expect(converted.value).toBeCloseTo(5280, 0);
    });

    it('should convert kilometers to miles', () => {
      const stepSize = StepSize.kilometers(1);
      const converted = stepSize.convertTo(StepSizeUnit.Miles);
      expect(converted.value).toBeCloseTo(0.6214, 3);
    });

    it('should convert feet to kilometers', () => {
      const stepSize = StepSize.feet(3280.84);
      const converted = stepSize.convertTo(StepSizeUnit.Kilometers);
      expect(converted.value).toBeCloseTo(1, 2);
    });
  });

  describe('Conversion Methods', () => {
    it('toMeters should convert to meters', () => {
      expect(StepSize.kilometers(1).toMeters().value).toBe(1000);
      expect(StepSize.meters(100).toMeters().value).toBe(100);
      expect(StepSize.miles(1).toMeters().value).toBeCloseTo(1609.34, 2);
      expect(StepSize.feet(100).toMeters().value).toBeCloseTo(30.48, 2);
    });

    it('toMeters should set unit to meters', () => {
      expect(StepSize.kilometers(1).toMeters().unit).toBe(StepSizeUnit.Meters);
      expect(StepSize.feet(100).toMeters().unit).toBe(StepSizeUnit.Meters);
    });

    it('toKilometers should convert to kilometers', () => {
      expect(StepSize.meters(1000).toKilometers().value).toBe(1);
      expect(StepSize.kilometers(2).toKilometers().value).toBe(2);
      expect(StepSize.meters(500).toKilometers().value).toBe(0.5);
    });

    it('toKilometers should set unit to kilometers', () => {
      expect(StepSize.meters(1000).toKilometers().unit).toBe(StepSizeUnit.Kilometers);
    });

    it('toMiles should convert to miles', () => {
      expect(StepSize.miles(1).toMiles().value).toBe(1);
      expect(StepSize.meters(1609.34).toMiles().value).toBeCloseTo(1, 2);
      expect(StepSize.kilometers(1.60934).toMiles().value).toBeCloseTo(1, 2);
    });

    it('toMiles should set unit to miles', () => {
      expect(StepSize.meters(1609.34).toMiles().unit).toBe(StepSizeUnit.Miles);
    });

    it('toFeet should convert to feet', () => {
      expect(StepSize.feet(100).toFeet().value).toBe(100);
      expect(StepSize.meters(30.48).toFeet().value).toBeCloseTo(100, 2);
      expect(StepSize.meters(1).toFeet().value).toBeCloseTo(3.28084, 2);
    });

    it('toFeet should set unit to feet', () => {
      expect(StepSize.meters(1).toFeet().unit).toBe(StepSizeUnit.Feet);
    });
  });

  describe('toString', () => {
    it('should return correct string representation for each unit', () => {
      expect(StepSize.meters(100).toString()).toBe('100m');
      expect(StepSize.feet(50).toString()).toBe('50ft');
      expect(StepSize.miles(2).toString()).toBe('2mi');
      expect(StepSize.kilometers(3).toString()).toBe('3km');
    });

    it('should include decimal values in string', () => {
      expect(StepSize.meters(1.5).toString()).toBe('1.5m');
      expect(StepSize.kilometers(0.25).toString()).toBe('0.25km');
    });
  });

  describe('StepSizeUnit enum', () => {
    it('should have correct string values', () => {
      expect(StepSizeUnit.Kilometers).toBe('km');
      expect(StepSizeUnit.Meters).toBe('m');
      expect(StepSizeUnit.Miles).toBe('mi');
      expect(StepSizeUnit.Feet).toBe('ft');
    });
  });

  describe('IStepSize interface compliance', () => {
    it('should have value and unit properties', () => {
      const stepSize = StepSize.meters(100);
      expect(stepSize).toHaveProperty('value');
      expect(stepSize).toHaveProperty('unit');
    });
  });
});
