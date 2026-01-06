import { AudiomSource, MapType } from '../../../../shared/audiom-client/AudiomSource'
import { AudiomEmbedConfig } from '../../../../shared/audiom-client/AudiomEmbedConfig'

export enum FieldType {
  Text = 'text',
  Number = 'number',
  Switch = 'switch'
}

export interface FieldConfig {
  key: string
  label: string
  type: FieldType
  placeholder?: string
  min?: number
  max?: number
  defaultValue?: string | number | boolean
  showWhen?: (config: IAudiomConfig) => boolean
}

export interface IAudiomConfig {
  apiKey?: string
  baseUrl?: string
  heading?:  1 | 2 | 3 | 4 | 5 | 6;
  title?: string
  stepSize?: number
  showVisualMap?: boolean
  showHeading?: boolean
  soundpackUrl?: string
  rulesFileUrl?: string
  sourceUrl?: string
  centerLatitude?: number
  centerLongitude?: number
  zoom?: number
  useExistingMap?: boolean
}