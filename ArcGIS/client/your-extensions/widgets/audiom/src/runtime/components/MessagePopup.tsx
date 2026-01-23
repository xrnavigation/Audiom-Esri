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

interface VariantStyle {
  backgroundColor: string
  fontColor: string
  icon: string
}

const VARIANT_STYLES: Record<MessageType, VariantStyle> = {
  [MessageType.Warning]: {
    backgroundColor: 'rgba(255, 193, 7, 0.95)',
    fontColor: '#000',
    icon: '⚠️'
  },
  [MessageType.Notification]: {
    backgroundColor: 'rgba(33, 150, 243, 0.95)',
    fontColor: '#fff',
    icon: 'ℹ️'
  },
  [MessageType.Error]: {
    backgroundColor: 'rgba(244, 67, 54, 0.95)',
    fontColor: '#fff',
    icon: '❌'
  }
}

/**
 * A reusable popup message component with support for different variants.
 * Displays a styled banner at the top or bottom of its container.
 */
const MessagePopup = (props: MessagePopupProps) => {
  const { show, message, variant = MessageType.Notification, icon, position = MessagePosition.Top } = props

  if (!show) {
    return null
  }

  const variantStyle = VARIANT_STYLES[variant]
  const displayIcon = icon ?? variantStyle.icon

  return (
    <div style={{
      position: 'absolute',
      ...(position === MessagePosition.Top ? { top: '10px' } : { bottom: '10px' }),
      left: '10px',
      right: '10px',
      backgroundColor: variantStyle.backgroundColor,
      color: variantStyle.fontColor,
      padding: '8px 12px',
      borderRadius: '4px',
      fontSize: '13px',
      zIndex: 1000,
      boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }}>
      <span style={{ fontSize: '16px' }}>{displayIcon}</span>
      <span>{message}</span>
    </div>
  )
}

export default MessagePopup
