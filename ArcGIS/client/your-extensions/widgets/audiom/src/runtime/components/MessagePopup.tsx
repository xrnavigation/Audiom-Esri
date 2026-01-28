import { React, css, type SerializedStyles } from 'jimu-core'

export enum MessageType {
  Warning = 'warning',
  Notification = 'notification',
  Error = 'error'
}

export enum MessagePosition {
  Top = 'top',
  Bottom = 'bottom'
}

interface MessagePopupProps {
  /** Whether to show the popup */
  show: boolean
  /** The message to display */
  message: string
  /** The type of message (default: MessageType.Notification) */
  variant?: MessageType
  /** Optional custom icon (overrides default variant icon) */
  icon?: string
  /** Position of the popup (default: MessagePosition.Top) */
  position?: MessagePosition
}

const VARIANT_ICONS: Record<MessageType, string> = {
  [MessageType.Warning]: '⚠️',
  [MessageType.Notification]: 'ℹ️',
  [MessageType.Error]: '❌'
}

// Styles
const styles = {
  base: css`
    position: absolute;
    left: 10px;
    right: 10px;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 13px;
    z-index: 1000;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    display: flex;
    align-items: center;
    gap: 8px;
  `,
  top: css`top: 10px;`,
  bottom: css`bottom: 10px;`,
  warning: css`
    background-color: rgba(255, 193, 7, 0.95);
    color: #000;
  `,
  notification: css`
    background-color: rgba(33, 150, 243, 0.95);
    color: #fff;
  `,
  error: css`
    background-color: rgba(244, 67, 54, 0.95);
    color: #fff;
  `,
  icon: css`
    font-size: 16px;
    flex-shrink: 0;
  `,
  message: css`flex: 1;`
} as const

const VARIANT_STYLES: Record<MessageType, SerializedStyles> = {
  [MessageType.Warning]: styles.warning,
  [MessageType.Notification]: styles.notification,
  [MessageType.Error]: styles.error
}

/**
 * A reusable popup message component with support for different variants.
 * Displays a styled banner at the top or bottom of its container.
 * 
 * Accessibility:
 * - Uses role="alert" for screen reader announcements
 * - aria-live="polite" for non-intrusive updates
 */
const MessagePopup = (props: MessagePopupProps) => {
  const { show, message, variant = MessageType.Notification, icon, position = MessagePosition.Top } = props

  if (!show) {
    return null
  }

  const displayIcon = icon ?? VARIANT_ICONS[variant]
  const positionStyle = position === MessagePosition.Top ? styles.top : styles.bottom
  const variantStyle = VARIANT_STYLES[variant]

  return (
    <div 
      css={[styles.base, positionStyle, variantStyle]}
      role="alert"
      aria-live="polite"
    >
      <span css={styles.icon} aria-hidden="true">{displayIcon}</span>
      <span css={styles.message}>{message}</span>
    </div>
  )
}

export default MessagePopup
