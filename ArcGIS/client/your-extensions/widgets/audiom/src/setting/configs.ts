import type { ValidityResult } from 'jimu-ui'
import type { React } from 'jimu-core'
import { MapType } from '../../../../shared/audiom-client/AudiomSource'
import { StepSizeUnit } from '../../../../shared/audiom-client/StepSize'
import { VisualStyle } from '../../../../shared/audiom-client/AudiomEmbedConfig'
import { FieldType } from './enums'
import type { LockableFieldName } from './configKeys'

/**
 * Centralized default configuration values for the Audiom widget.
 * Use these constants throughout the codebase to ensure consistency.
 */
export const DEFAULT_CONFIG = {
  baseUrl: 'https://audiom-staging.herokuapp.com',
  stepSize: 1,
  stepSizeUnit: StepSizeUnit.Meters,
  showVisualMap: true,
  showHeading: false,
  zoom: 10,
  heading: 3,
  useExistingMap: true,
  centerLatitude: 0,
  centerLongitude: 0,
  sourceConfigs: [] as ISourceConfig[],
  titleLocked: true,
  centerLatitudeLocked: true,
  centerLongitudeLocked: true,
  zoomLocked: true,
} as const satisfies Partial<IAudiomConfig>

export const DEFAULT_SOURCE_CONFIG: ISourceConfig = {
  source: undefined,
  name: undefined,
  sourceUrl: undefined,
  rulesFileUrl: undefined,
  mapType: MapType.Indoor,
  where: undefined,
  enabled: true,
  locked: true
}

export interface IVisualBaseLayerConfig {
  /** URL for the visual base layer image overlay */
  url: string
  /** Serialized GeoQuad position string: "[[lng,lat],[lng,lat],[lng,lat],[lng,lat]]" */
  position?: string
}

export const DEFAULT_VISUAL_BASE_LAYER: IVisualBaseLayerConfig = {
  url: '',
  position: undefined
}

export interface CoordinatePairFieldConfig {
  /** Config key for the longitude value (FieldConfig.key is used for latitude) */
  lngKey: keyof IAudiomConfig
  /** Label for the latitude field (default: "Lat") */
  latLabel?: string
  /** Label for the longitude field (default: "Lng") */
  lngLabel?: string
  /** Lockable field name for latitude */
  latLockableFieldName?: LockableFieldName
  /** Lockable field name for longitude */
  lngLockableFieldName?: LockableFieldName
  /** Compact mode for tighter spacing */
  compact?: boolean
}

export interface FieldConfig {
  key: keyof IAudiomConfig
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
  /** Optional callback to render additional content after this field */
  renderAfter?: () => React.ReactElement
  /** Optional callback to render custom field content (used with FieldType.Custom) */
  renderCustom?: () => React.ReactElement
  /** If true, this field supports lock/unlock for map sync */
  lockable?: boolean
  /** The LockableFieldName for this field (required if lockable is true) */
  lockableFieldName?: LockableFieldName
  /** Config for CoordinatePair fields (only used with FieldType.CoordinatePair) */
  coordinatePair?: CoordinatePairFieldConfig
}

export interface ISourceConfig {
  source?: string
  name?: string
  sourceUrl?: string
  rulesFileUrl?: string
  mapType?: MapType
  where?: string  // Definition expression / where clause to filter features
  enabled?: boolean
  locked?: boolean  // When locked (default), syncs with map. When unlocked, uses manual enabled state.
}

export interface IAudiomConfig {
  apiKey?: string
  baseUrl?: string
  heading?:  1 | 2 | 3 | 4 | 5 | 6;
  title?: string
  titleLocked?: boolean  // When locked (default), syncs with map title. When unlocked, uses manual title.
  stepSize?: number
  stepSizeUnit?: StepSizeUnit
  showVisualMap?: boolean
  showHeading?: boolean
  soundpackUrl?: string
  visualBaseLayers?: IVisualBaseLayerConfig[]
  visualStyle?: VisualStyle
  sourceConfigs?: ISourceConfig[]
  centerLatitude?: number
  centerLatitudeLocked?: boolean  // When locked (default), syncs with map. When unlocked, uses manual value.
  centerLongitude?: number
  centerLongitudeLocked?: boolean  // When locked (default), syncs with map. When unlocked, uses manual value.
  zoom?: number
  zoomLocked?: boolean  // When locked (default), syncs with map. When unlocked, uses manual value.
  useExistingMap?: boolean
  existingMapId?: string
  // Jimu ImmutableObject methods - these are added by the framework
  set?: <K extends keyof IAudiomConfig>(key: K, value: IAudiomConfig[K]) => IAudiomConfig
}

/**
 * Type-safe config value accessor with default fallback.
 * Eliminates repetitive `config?.[key] ?? DEFAULT_CONFIG[key]` patterns.
 * 
 * @param config - The current widget configuration
 * @param key - The configuration key to access
 * @returns The config value or its default from DEFAULT_CONFIG
 * 
 * @example
 * const zoom = getConfigValue(config, 'zoom') // number
 * const sources = getConfigValue(config, 'sourceConfigs') // ISourceConfig[]
 */
export function getConfigValue<K extends keyof typeof DEFAULT_CONFIG>(
  config: IAudiomConfig | undefined,
  key: K
): (typeof DEFAULT_CONFIG)[K] {
  if (config && key in config && config[key as keyof IAudiomConfig] !== undefined) {
    return config[key as keyof IAudiomConfig] as (typeof DEFAULT_CONFIG)[K]
  }
  return DEFAULT_CONFIG[key]
}

/**
 * Type-safe source config value accessor with default fallback.
 * Eliminates repetitive `source?.[key] ?? DEFAULT_SOURCE_CONFIG[key]` patterns.
 * 
 * @param source - The source configuration
 * @param key - The source config key to access
 * @returns The source config value or its default from DEFAULT_SOURCE_CONFIG
 * 
 * @example
 * const mapType = getSourceConfigValue(source, 'mapType') // MapType
 * const enabled = getSourceConfigValue(source, 'enabled') // boolean
 */
export function getSourceConfigValue<K extends keyof ISourceConfig>(
  source: ISourceConfig | undefined,
  key: K
): ISourceConfig[K] {
  if (source && key in source && source[key] !== undefined) {
    return source[key]
  }
  return DEFAULT_SOURCE_CONFIG[key]
}
