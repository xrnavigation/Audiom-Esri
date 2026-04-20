import { React, css } from 'jimu-core'
import { Tooltip } from 'jimu-ui'
import { CopyOutlined } from 'jimu-icons/outlined/editor/copy'
import { Colors } from '../enums'
import { useCopyToClipboard } from '../useCopyToClipboard'
import { TOOLTIP_COPY, TOOLTIP_COPIED } from '../strings'

const copyButtonStyle = css({
  padding: 2,
  background: Colors.Transparent,
  border: 'none',
  cursor: 'pointer',
  color: Colors.TextMuted,
  opacity: 0.6,
  transition: 'opacity 0.15s ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '&:hover': {
    opacity: 1
  },
  '&:focus-visible': {
    outline: `2px solid ${Colors.FocusOutline}`,
    outlineOffset: 1,
    borderRadius: 2
  },
  '&:disabled': {
    opacity: 0.3,
    cursor: 'not-allowed'
  }
})

export interface CopyButtonProps {
  /** The value to write to the clipboard */
  value: string
  /** aria-label for the button (full sentence, e.g. "Copy filter 1 to clipboard") */
  ariaLabel: string
  /** Icon size in px (default 12) */
  iconSize?: number
  /** Disable the button */
  disabled?: boolean
  /** Stop click propagation (useful when nested inside a clickable header) */
  stopPropagation?: boolean
}

/**
 * Small icon-only copy-to-clipboard button used across the settings UI.
 * Native <button> for accessibility; encapsulates the copied/idle state and styling.
 */
const CopyButton = (props: CopyButtonProps) => {
  const { value, ariaLabel, iconSize = 12, disabled = false, stopPropagation = false } = props
  const { copied, copyToClipboard } = useCopyToClipboard()

  const handleClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.preventDefault()
      e.stopPropagation()
    }
    copyToClipboard(value)
  }

  return (
    <Tooltip title={copied ? TOOLTIP_COPIED : TOOLTIP_COPY} placement="top">
      <button
        type="button"
        css={copyButtonStyle}
        onClick={handleClick}
        aria-label={ariaLabel}
        disabled={disabled}
      >
        <CopyOutlined size={iconSize} color={copied ? Colors.Success : undefined} />
      </button>
    </Tooltip>
  )
}

export default CopyButton
