export enum FieldType {
  Text = 'text',
  Password = 'password',
  Number = 'number',
  Switch = 'switch',
  Enum = 'enum',
  Custom = 'custom'
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

/**
 * HTML button type attribute values.
 */
export enum HtmlButtonType {
  Button = 'button',
  Submit = 'submit',
  Reset = 'reset'
}

/**
 * Theme colors used throughout the widget.
 * Uses CSS custom properties where available for theme consistency.
 */
export enum Colors {
  /** Card/panel header background */
  HeaderBackground = 'rgb(88, 88, 88)',
  /** Primary accent color (ArcGIS blue) */
  PrimaryMain = 'var(--sys-color-primary-main, #0079c1)',
  /** Focus outline for keyboard navigation */
  FocusOutline = 'var(--sys-color-primary-main, #0079c1)',
  /** Muted text color for hints and secondary information */
  TextMuted = '#6b7280'
}
