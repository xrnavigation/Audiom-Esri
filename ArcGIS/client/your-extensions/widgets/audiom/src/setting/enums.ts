export enum FieldType {
  Text = 'text',
  Password = 'password',
  Number = 'number',
  Switch = 'switch',
  Enum = 'enum',
  Custom = 'custom',
  CoordinatePair = 'coordinate-pair'
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

export enum FlowType {
  Wrap = 'wrap',
  NoWrap = 'no-wrap'
}

export enum IconSize {
  Small = 's',
  Medium = 'm',
  Large = 'l'
}

export enum HtmlButtonType {
  Button = 'button',
  Submit = 'submit',
  Reset = 'reset'
}

// ARIA Accessibility

/**
 * @see https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-live
 */
export enum AriaLive {
  Polite = 'polite',
  Assertive = 'assertive',
  Off = 'off'
}

/**
 * @see https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles
 */
export enum AriaRole {
  /** Auto sets aria-live="assertive" */
  Alert = 'alert',
  Heading = 'heading',
  Button = 'button',
  Status = 'status',
  Group = 'group',
  Region = 'region'
}

// Theme Colors

/**
 * Uses CSS custom properties where available for theme consistency.
 */
export enum Colors {
  HeaderBackground = 'rgb(88, 88, 88)',
  Transparent = 'transparent',
  
  PrimaryMain = 'var(--sys-color-primary-main, #0079c1)',
  FocusOutline = 'var(--sys-color-primary-main, #0079c1)',
  
  TextMuted = 'var(--ref-palette-neutral-700, #6b7280)',
  TextBlack = '#000',
  TextWhite = '#fff',
  
  Success = '#10b981',
  WarningBackground = 'rgba(255, 193, 7, 0.95)',
  InfoBackground = 'rgba(33, 150, 243, 0.95)',
  ErrorBackground = 'rgba(244, 67, 54, 0.95)',
  
  BoxShadow = '0 2px 6px rgba(0, 0, 0, 0.2)'
}

// Map Type Options - shared between SourceConfigList and SourceConfigCard
import { MapType } from '../../../../shared/audiom-client/AudiomSource'

export const MAP_TYPE_OPTIONS = [
  { label: 'Indoor', value: MapType.Indoor },
  { label: 'Heatmap', value: MapType.Heatmap },
  { label: 'Travel', value: MapType.Travel }
] as const
