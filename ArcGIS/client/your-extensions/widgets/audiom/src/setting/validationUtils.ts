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

/**
 * Clamps a number to the specified range
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
/**
 * Parses step size value and returns a number
 * Removes unit suffixes (m, km, mi, ft) and converts to number
 */
export function parseStepSize(value: string | number | undefined): number | undefined {
  if (isNullish(value)) {
    return undefined
  }
  const strValue = String(value)
  // Remove unit suffix and parse as number
  const numValue = parseFloat(strValue.replace(/[a-z]+$/i, ''))
  return isNaN(numValue) ? undefined : numValue
}
/**
 * Generic validation and sanitization helper
 * @param value - Value to validate and sanitize
 * @param validator - Validation function
 * @param sanitizer - Function that returns sanitized value
 * @param fieldLabel - Human-readable field name for warning message
 * @param warnings - Array to append warnings to
 * @param formatWarning - Function to format the warning message given context
 * @returns Sanitized value if invalid, original value if valid, undefined if nullish
 */
export function validateAndSanitize<T>(
  value: T | undefined,
  validator: (val: T) => { valid: boolean; msg?: string },
  sanitizer: (val: T) => T,
  fieldLabel: string,
  warnings: string[],
  formatWarning: (fieldLabel: string, value: T, sanitizedValue: T, validationMsg: string) => string
): T | undefined {
  if (isNullish(value)) return undefined
  
  const validation = validator(value)
  if (!validation.valid) {
    const sanitizedValue = sanitizer(value)
    warnings.push(formatWarning(fieldLabel, value, sanitizedValue, validation.msg || 'Invalid value'))
    return sanitizedValue
  }
  return value
}

/**
 * Validate and clamp numeric field to range
 * @param value - Numeric value to validate and clamp
 * @param validator - Validation function for the number
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param fieldLabel - Human-readable field name for warning message
 * @param warnings - Array to append warnings to
 * @returns Clamped value if invalid, original value if valid, undefined if nullish
 */
export function validateAndClamp(
  value: number | undefined,
  validator: (val: number) => { valid: boolean; msg?: string },
  min: number,
  max: number,
  fieldLabel: string,
  warnings: string[]
): number | undefined {
  return validateAndSanitize(
    value,
    validator,
    (val) => clamp(val, min, max),
    fieldLabel,
    warnings,
    (label, val, sanitized, msg) =>
      `${label} value ${val} is out of range: ${msg}. Clamped to ${sanitized}.`
  )
}

/**
 * Validate and reset field to default value if invalid
 * @param value - Value to validate
 * @param validator - Validation function
 * @param defaultValue - Default value to use if invalid
 * @param fieldLabel - Human-readable field name for warning message
 * @param warnings - Array to append warnings to
 * @returns Default value if invalid, original value if valid, undefined if nullish
 */
export function validateAndReset<T>(
  value: T | undefined,
  validator: (val: T) => { valid: boolean; msg?: string },
  defaultValue: T,
  fieldLabel: string,
  warnings: string[]
): T | undefined {
  return validateAndSanitize(
    value,
    validator,
    () => defaultValue,
    fieldLabel,
    warnings,
    (label, val, sanitized, msg) =>
      `${label} value ${val} is invalid: ${msg}. Reset to default ${sanitized}.`
  )
}
