import { React, css } from 'jimu-core'
import { Button, Tooltip } from 'jimu-ui'
import { ButtonSize, ButtonType } from '../enums'

/**
 * Standard square footprint for small icon-only action buttons.
 * Matches stock ArcGIS Experience Builder widget chrome (Tertiary button hover background).
 */
const ICON_BUTTON_SIZE = 24
const ICON_GLYPH_SIZE = 12

const baseButtonStyle = css({
  width: ICON_BUTTON_SIZE,
  height: ICON_BUTTON_SIZE,
  minWidth: ICON_BUTTON_SIZE,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  '& svg': {
    width: ICON_GLYPH_SIZE,
    height: ICON_GLYPH_SIZE
  }
})

const disabledStyle = css({
  opacity: 0.3,
  cursor: 'not-allowed'
})

export interface IconActionButtonProps {
  /** Tooltip text. Also used for title/aria-label fallback. */
  tooltip?: string
  /** Accessible label. Falls back to tooltip when omitted. */
  ariaLabel?: string
  /** Click handler. Not invoked while disabled. */
  onClick?: (e: React.MouseEvent) => void
  /**
   * Visually disable the button while keeping it focusable so the tooltip
   * still appears on hover. Maps to aria-disabled and a muted style; click
   * is suppressed.
   */
  disabled?: boolean
  /** Mark the button as active (pressed/toggled on). */
  active?: boolean
  /** Stop click propagation (use when nested inside a clickable header). */
  stopPropagation?: boolean
  /** Optional override for inner glyph size (default 12px). */
  iconSize?: number
  /** The icon element. Sized via the `iconSize` prop or the default 12px. */
  children: React.ReactNode
}

/**
 * Shared icon-only action button used across the settings UI.
 *
 * Wraps Jimu's Tertiary `<Button icon size="sm">` in a fixed square footprint
 * so heterogeneous glyphs (lock vs unlock, visible vs invisible, plus, trash,
 * copy, expand/collapse) render with the same hit area, hover background, and
 * focus ring — matching native EXB widgets.
 */
const IconActionButton = (props: IconActionButtonProps) => {
  const {
    tooltip,
    ariaLabel,
    onClick,
    disabled = false,
    active = false,
    stopPropagation = false,
    iconSize,
    children
  } = props

  const handleClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.stopPropagation()
    }
    if (disabled) {
      e.preventDefault()
      return
    }
    onClick?.(e)
  }

  const sizeOverrideStyle = iconSize !== undefined
    ? css({ '& svg': { width: iconSize, height: iconSize } })
    : undefined

  const button = (
    <Button
      type={ButtonType.Tertiary}
      size={ButtonSize.Small}
      icon
      active={active}
      onClick={handleClick}
      aria-label={ariaLabel ?? tooltip}
      aria-disabled={disabled || undefined}
      css={[baseButtonStyle, disabled && disabledStyle, sizeOverrideStyle]}
    >
      {children}
    </Button>
  )

  if (!tooltip) return button

  return (
    <Tooltip title={tooltip} placement="top">
      {button}
    </Tooltip>
  )
}

export default IconActionButton
