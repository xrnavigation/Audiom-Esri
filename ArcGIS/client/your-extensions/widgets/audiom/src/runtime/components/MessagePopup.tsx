import { React } from 'jimu-core'
import { Colors, AriaLive, AriaRole } from '../../setting/enums'

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

// Typed styles with full key/value validation
const styles = {
  base: {
    position: 'absolute',
    left: 10,
    right: 10,
    padding: '8px 12px',
    borderRadius: 4,
    fontSize: 13,
    zIndex: 1000,
    boxShadow: Colors.BoxShadow,
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  top: { top: 10 },
  bottom: { bottom: 10 },
  warning: {
    backgroundColor: Colors.WarningBackground,
    color: Colors.TextBlack
  },
  notification: {
    backgroundColor: Colors.InfoBackground,
    color: Colors.TextWhite
  },
  error: {
    backgroundColor: Colors.ErrorBackground,
    color: Colors.TextWhite
  },
  icon: {
    fontSize: 16,
    flexShrink: 0
  },
  message: { flex: 1 }
} as const satisfies Record<string, React.CSSProperties>

const VARIANT_STYLES: Record<MessageType, React.CSSProperties> = {
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
      style={{ ...styles.base, ...positionStyle, ...variantStyle }}
      role={AriaRole.Alert}
      aria-live={AriaLive.Polite}
    >
      <span style={styles.icon} aria-hidden="true">{displayIcon}</span>
      <span style={styles.message}>{message}</span>
    </div>
  )
}

export default MessagePopup
