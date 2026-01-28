import '../../styles/widget.css'

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
  const positionClass = position === MessagePosition.Top ? 'audiom-message-popup--top' : 'audiom-message-popup--bottom'
  const variantClass = `audiom-message-popup--${variant}`

  return (
    <div 
      className={`audiom-message-popup ${positionClass} ${variantClass}`}
      role="alert"
      aria-live="polite"
    >
      <span className="audiom-message-popup__icon" aria-hidden="true">{displayIcon}</span>
      <span className="audiom-message-popup__message">{message}</span>
    </div>
  )
}

export default MessagePopup
