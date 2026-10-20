import type { ValidityResult } from 'jimu-ui'
import { React } from 'jimu-core'
import { DEFAULT_CONFIG, IAudiomConfig } from '../configs'
import { isNullish, isNullishOrWhiteSpace, validateAndClamp, validateAndReset, parseStepSize } from './validationUtils'
import { createLogger } from '../../utils/logger'

const { useEffect, useRef } = React
const logger = createLogger('Validation')

// Validation constants
export const VALIDATION = {
  LATITUDE_MIN: -90,
  LATITUDE_MAX: 90,
  LONGITUDE_MIN: -180,
  LONGITUDE_MAX: 180,
  ZOOM_MIN: 0,
  ZOOM_MAX: 22,
  STEP_SIZE_PATTERN: /^\d+\.?\d*(m|km|mi|ft)?$/,
  COORDINATES_PATTERN: /^-?\d+\.?\d*,-?\d+\.?\d*$/,
} as const

// Validation messages
const MESSAGES = {
  LATITUDE_RANGE: `Latitude must be between ${VALIDATION.LATITUDE_MIN} and ${VALIDATION.LATITUDE_MAX}`,
  LONGITUDE_RANGE: `Longitude must be between ${VALIDATION.LONGITUDE_MIN} and ${VALIDATION.LONGITUDE_MAX}`,
  ZOOM_RANGE: `Zoom must be between ${VALIDATION.ZOOM_MIN} and ${VALIDATION.ZOOM_MAX}`,
  STEP_SIZE_FORMAT: 'Step size must be a number, optionally followed by m, km, mi, or ft',
  REQUIRED: 'This field is required',
  INVALID_URL: 'Please enter a valid URL',
} as const

/**
 * Build a numeric range validator. Nullish values are considered valid
 * (use validateRequired separately to enforce presence).
 */
function makeRangeValidator(min: number, max: number, msg: string) {
  return (value: number | undefined): ValidityResult => {
    if (isNullish(value)) {
      return { valid: true }
    }
    const valid = value >= min && value <= max
    return { valid, msg: valid ? undefined : msg }
  }
}

/** Validates latitude value is within -90 to 90 range */
export const validateLatitude = makeRangeValidator(
  VALIDATION.LATITUDE_MIN, VALIDATION.LATITUDE_MAX, MESSAGES.LATITUDE_RANGE
)

/** Validates longitude value is within -180 to 180 range */
export const validateLongitude = makeRangeValidator(
  VALIDATION.LONGITUDE_MIN, VALIDATION.LONGITUDE_MAX, MESSAGES.LONGITUDE_RANGE
)

/** Validates zoom level is within 0 to 22 range */
export const validateZoom = makeRangeValidator(
  VALIDATION.ZOOM_MIN, VALIDATION.ZOOM_MAX, MESSAGES.ZOOM_RANGE
)

/**
 * Validates step size matches pattern: number optionally followed by unit (m, km, mi, ft)
 */
export function validateStepSize(value: string | number | undefined): ValidityResult {
  if (isNullishOrWhiteSpace(String(value))) {
    return { valid: true }
  }
  const strValue = String(value)
  const valid = VALIDATION.STEP_SIZE_PATTERN.test(strValue)
  return {
    valid,
    msg: valid ? undefined : MESSAGES.STEP_SIZE_FORMAT
  }
}

/** URL schemes permitted for user-supplied URLs. Excludes javascript:/data:/file: etc. */
const ALLOWED_URL_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Validates a URL string or local path.
 * Allows:
 * - Full http(s) URLs only — javascript:, data:, file:, etc. are rejected
 *   to prevent XSS via iframe src or window.open.
 * - Relative paths (./path, ../path, /path)
 */
export function validateUrl(value: string | undefined): ValidityResult {
  if (isNullishOrWhiteSpace(value)) {
    return { valid: true }
  }

  const trimmed = value.trim()

  // Allow relative paths
  if (trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('/')) {
    return { valid: true }
  }

  // Validate full URLs and restrict to safe protocols
  try {
    const parsed = new URL(trimmed)
    if (!ALLOWED_URL_PROTOCOLS.has(parsed.protocol)) {
      return { valid: false, msg: MESSAGES.INVALID_URL }
    }
    return { valid: true }
  } catch {
    return { valid: false, msg: MESSAGES.INVALID_URL }
  }
}

/**
 * Validates required field is not empty
 */
export function validateRequired(value: string | undefined): ValidityResult {
  const valid = !isNullishOrWhiteSpace(value)
  return {
    valid,
    msg: valid ? undefined : MESSAGES.REQUIRED
  }
}

/**
 * Validates and sanitizes a config loaded from storage/JSON.
 * Returns a sanitized copy with invalid values clamped or reset to defaults.
 * Also returns a list of any validation warnings.
 */
export interface SanitizeResult {
  config: Partial<IAudiomConfig>
  warnings: string[]
}

export function sanitizeConfig(config: IAudiomConfig): SanitizeResult {
  const warnings: string[] = []
  const sanitized: Partial<IAudiomConfig> = { ...config }

  // Clamp numeric ranges
  sanitized.centerLatitude = validateAndClamp(
    config.centerLatitude,
    validateLatitude,
    VALIDATION.LATITUDE_MIN,
    VALIDATION.LATITUDE_MAX,
    'Center latitude',
    warnings
  ) ?? config.centerLatitude

  sanitized.centerLongitude = validateAndClamp(
    config.centerLongitude,
    validateLongitude,
    VALIDATION.LONGITUDE_MIN,
    VALIDATION.LONGITUDE_MAX,
    'Center longitude',
    warnings
  ) ?? config.centerLongitude

  sanitized.zoom = validateAndClamp(
    config.zoom,
    validateZoom,
    VALIDATION.ZOOM_MIN,
    VALIDATION.ZOOM_MAX,
    'Zoom level',
    warnings
  ) ?? config.zoom

  // Reset to defaults (parse stepSize to number)
  const sanitizedStepSize = validateAndReset(
    config.stepSize,
    validateStepSize,
    DEFAULT_CONFIG.stepSize,
    'Step size',
    warnings
  )
  if (sanitizedStepSize !== undefined) {
    sanitized.stepSize = parseStepSize(sanitizedStepSize) ?? DEFAULT_CONFIG.stepSize
  }

  const sanitizedBaseUrl = validateAndReset(
    config.baseUrl,
    validateUrl,
    DEFAULT_CONFIG.baseUrl,
    'Base URL',
    warnings
  )
  if (sanitizedBaseUrl !== undefined) {
    sanitized.baseUrl = sanitizedBaseUrl
  }

  return { config: sanitized, warnings }
}

/**
 * Comprehensive config validation for determining if config is ready for use.
 * Returns true only if all required fields are present and all values are valid.
 */
export function isConfigValid(config: IAudiomConfig): boolean {
  // API key is required
  if (!config.apiKey?.trim()) {
    return false
  }

  // Validate base URL if provided
  if (config.baseUrl && !validateUrl(config.baseUrl).valid) {
    return false
  }

  // When not using existing map, validate coordinates
  if (!config.useExistingMap) {
    if (!validateLatitude(config.centerLatitude).valid) {
      return false
    }
    if (!validateLongitude(config.centerLongitude).valid) {
      return false
    }
  }

  // Validate zoom
  if (!validateZoom(config.zoom).valid) {
    return false
  }

  // // TODO: Validate step size
  // if (!validateStepSize(config.stepSize).valid) {
  //   return false
  // }

  return true
}

/**
 * React hook that logs validation warnings once per unique warning set.
 * Prevents duplicate console warnings when component re-renders with same issues.
 *
 * @param warnings - Array of warning messages
 * @param prefix - Optional prefix for log messages (default: '[Audiom Config]')
 */
export function useLogWarnings(warnings: string[], prefix: string = '[Audiom Config]'): void {
  const lastWarningsRef = useRef<string>('')

  useEffect(() => {
    const warningsKey = warnings.join(',')
    if (warnings.length > 0 && warningsKey !== lastWarningsRef.current) {
      lastWarningsRef.current = warningsKey
      logger.warn(`${prefix} Validation warnings:`, warnings)
    }
  }, [warnings, prefix])
}
