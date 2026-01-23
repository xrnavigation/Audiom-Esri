import type { ValidityResult } from 'jimu-ui'
import { MapType } from '../../../../shared/audiom-client/AudiomSource'
import { FieldType } from './enums'

/**
 * Centralized default configuration values for the Audiom widget.
 * Use these constants throughout the codebase to ensure consistency.
 */
export const DEFAULT_CONFIG = {
  baseUrl: 'https://audiom-staging.herokuapp.com',
  stepSize: 1,
  showVisualMap: true,
  showHeading: false,
  zoom: 10,
  heading: 3,
  useExistingMap: true,
  centerLatitude: 0,
  centerLongitude: 0,
  sourceConfigs: [] as ISourceConfig[],
} as const satisfies Partial<IAudiomConfig>

export interface FieldConfig {
  key: string
  label: string
  type: FieldType
  placeholder?: string
  min?: number
  max?: number
  defaultValue?: string | number | boolean
  showWhen?: (config: IAudiomConfig) => boolean
  enumOptions?: Array<{ label: string; value: string }>
  showCopyButton?: boolean
  /** Validation function called on blur/accept. Returns ValidityResult with valid flag and optional error message. */
  validateOnAccept?: (value: string | number) => ValidityResult
}

export interface ISourceConfig {
  source?: string
  name?: string
  sourceUrl?: string
  rulesFileUrl?: string
  mapType?: MapType
  enabled?: boolean
}

// TODO: Find a way to not use any here
export interface IAudiomConfig extends Record<string, any> {
  apiKey?: string
  baseUrl?: string
  heading?:  1 | 2 | 3 | 4 | 5 | 6;
  title?: string
  stepSize?: number
  showVisualMap?: boolean
  showHeading?: boolean
  soundpackUrl?: string
  sourceConfigs?: ISourceConfig[]
  centerLatitude?: number
  centerLongitude?: number
  zoom?: number
  useExistingMap?: boolean
  existingMapId?: string
}
