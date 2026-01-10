import { MapType } from '../../../../shared/audiom-client/AudiomSource'

export const defaultBaseUrl = 'https://audiom-staging.herokuapp.com'

export enum FieldType {
  Text = 'text',
  Number = 'number',
  Switch = 'switch',
  Enum = 'enum'
}

export enum ButtonSize {
  Default = 'default',
  Small = 'sm',
  Large = 'lg'
}

export enum ButtonType {
  Primary = 'primary',
  Secondary = 'secondary',
  Tertiary = 'tertiary',
  Danger = 'danger',
  Link = 'link'
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
  enumOptions?: Array<{ label: string; value: string }>
}

export interface ISourceConfig {
  source?: string
  name?: string
  sourceUrl?: string
  rulesFileUrl?: string
  mapType?: MapType
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