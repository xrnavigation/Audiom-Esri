/**
 * Utility functions for validation checks
 */

/**
 * Checks if a value is null or undefined
 */
export function isNullish(value: any): value is null | undefined {
  return value === undefined || value === null
}

/**
 * Checks if a string value is null, undefined, empty, or contains only whitespace
 */
export function isNullishOrWhiteSpace(value: string | undefined | null): boolean {
  return isNullish(value) || value.trim() === ''
}

/**
 * Checks if a value is a valid number (not null, undefined, NaN, or Infinity)
 */
export function isValidNumber(value: number | undefined | null): value is number {
  return !isNullish(value) && !isNaN(value) && isFinite(value)
}
