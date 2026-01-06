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
  showWhen?: (config: IMConfig) => boolean
}

export interface IMConfig {
  apiKey?: string
  baseUrl?: string
  heading?: number
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


