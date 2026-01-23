import type { ValidityResult } from 'jimu-ui'
import { React } from 'jimu-core'
import { DEFAULT_CONFIG, IAudiomConfig } from './configs'

const { useEffect, useRef } = React

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
 * Validates latitude value is within -90 to 90 range
 */
export function validateLatitude(value: number | undefined): ValidityResult {
  if (value === undefined || value === null) {
    return { valid: true }
  }
  const valid = value >= VALIDATION.LATITUDE_MIN && value <= VALIDATION.LATITUDE_MAX
  return {
    valid,
    msg: valid ? undefined : MESSAGES.LATITUDE_RANGE
  }
}

/**
 * Validates longitude value is within -180 to 180 range
 */
export function validateLongitude(value: number | undefined): ValidityResult {
  if (value === undefined || value === null) {
    return { valid: true }
  }
  const valid = value >= VALIDATION.LONGITUDE_MIN && value <= VALIDATION.LONGITUDE_MAX
  return {
    valid,
    msg: valid ? undefined : MESSAGES.LONGITUDE_RANGE
  }
}

/**
 * Validates zoom level is within 0 to 22 range
 */
export function validateZoom(value: number | undefined): ValidityResult {
  if (value === undefined || value === null) {
    return { valid: true }
  }
  const valid = value >= VALIDATION.ZOOM_MIN && value <= VALIDATION.ZOOM_MAX
  return {
    valid,
    msg: valid ? undefined : MESSAGES.ZOOM_RANGE
  }
}

/**
 * Validates step size matches pattern: number optionally followed by unit (m, km, mi, ft)
 */
export function validateStepSize(value: string | number | undefined): ValidityResult {
  if (value === undefined || value === null || value === '') {
    return { valid: true }
  }
  const strValue = String(value)
  const valid = VALIDATION.STEP_SIZE_PATTERN.test(strValue)
  return {
    valid,
    msg: valid ? undefined : MESSAGES.STEP_SIZE_FORMAT
  }
}

/**
 * Validates a URL string or local path.
 * Allows:
 * - Full URLs (http://, https://)
 * - Relative paths (./path, ../path, /path)
 * - Host:port patterns (localhost:3000, audiom:8080)
 */
export function validateUrl(value: string | undefined): ValidityResult {
  if (!value || value.trim() === '') {
    return { valid: true }
  }
  
  const trimmed = value.trim()
  
  // Allow relative paths
  if (trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('/')) {
    return { valid: true }
  }
  
  // Validate full URLs (requires http://, https://, etc.)
  try {
    new URL(trimmed)
    return { valid: true }
  } catch {
    return { valid: false, msg: MESSAGES.INVALID_URL }
  }
}

/**
 * Validates required field is not empty
 */
export function validateRequired(value: string | undefined): ValidityResult {
  const valid = value !== undefined && value !== null && value.trim() !== ''
  return {
    valid,
    msg: valid ? undefined : MESSAGES.REQUIRED
  }
}

/**
 * Clamps a number to the specified range
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Parses step size string to extract numeric value
 * Handles formats like "1", "1.5", "1km", "1.5mi"
 */
export function parseStepSizeValue(value: string | number | undefined): number {
  if (value === undefined || value === null) {
    return DEFAULT_CONFIG.stepSize
  }
  if (typeof value === 'number') {
    return value
  }
  const match = String(value).match(/^(\d+\.?\d*)/)
  return match ? parseFloat(match[1]) : DEFAULT_CONFIG.stepSize
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

  // Validate and clamp latitude
  if (config.centerLatitude !== undefined) {
    const latValidation = validateLatitude(config.centerLatitude)
    if (!latValidation.valid) {
      warnings.push(`Center latitude ${config.centerLatitude} is invalid: ${latValidation.msg}. Clamped to valid range.`)
      sanitized.centerLatitude = clamp(config.centerLatitude, VALIDATION.LATITUDE_MIN, VALIDATION.LATITUDE_MAX)
    }
  }

  // Validate and clamp longitude
  if (config.centerLongitude !== undefined) {
    const lngValidation = validateLongitude(config.centerLongitude)
    if (!lngValidation.valid) {
      warnings.push(`Center longitude ${config.centerLongitude} is invalid: ${lngValidation.msg}. Clamped to valid range.`)
      sanitized.centerLongitude = clamp(config.centerLongitude, VALIDATION.LONGITUDE_MIN, VALIDATION.LONGITUDE_MAX)
    }
  }

  // Validate and clamp zoom
  if (config.zoom !== undefined) {
    const zoomValidation = validateZoom(config.zoom)
    if (!zoomValidation.valid) {
      warnings.push(`Zoom level ${config.zoom} is invalid: ${zoomValidation.msg}. Clamped to valid range.`)
      sanitized.zoom = clamp(config.zoom, VALIDATION.ZOOM_MIN, VALIDATION.ZOOM_MAX)
    }
  }

  // Validate step size format
  if (config.stepSize !== undefined) {
    const stepValidation = validateStepSize(config.stepSize)
    if (!stepValidation.valid) {
      warnings.push(`Step size "${config.stepSize}" is invalid: ${stepValidation.msg}. Reset to default.`)
      sanitized.stepSize = DEFAULT_CONFIG.stepSize
    }
  }

  // Validate base URL
  if (config.baseUrl) {
    const urlValidation = validateUrl(config.baseUrl)
    if (!urlValidation.valid) {
      warnings.push(`Base URL "${config.baseUrl}" is invalid: ${urlValidation.msg}. Reset to default.`)
      sanitized.baseUrl = DEFAULT_CONFIG.baseUrl
    }
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

  // Validate step size
  if (!validateStepSize(config.stepSize).valid) {
    return false

  return true
  }
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
      console.warn(`${prefix} Validation warnings:`, warnings)
    }
  }, [warnings, prefix])
}
