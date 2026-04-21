import { React } from 'jimu-core'
import { CopyOutlined } from 'jimu-icons/outlined/editor/copy'
import { Colors } from '../enums'
import { useCopyToClipboard } from '../useCopyToClipboard'
import { TOOLTIP_COPY, TOOLTIP_COPIED } from '../strings'
import IconActionButton from './IconActionButton'

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
 * Built on the shared IconActionButton so the hit area, hover background,
 * and focus ring match the other small actions (lock, visibility, trash, plus).
 */
const CopyButton = (props: CopyButtonProps) => {
  const { value, ariaLabel, iconSize, disabled = false, stopPropagation = false } = props
  const { copied, copyToClipboard } = useCopyToClipboard()

  return (
    <IconActionButton
      tooltip={copied ? TOOLTIP_COPIED : TOOLTIP_COPY}
      ariaLabel={ariaLabel}
      onClick={() => copyToClipboard(value)}
      disabled={disabled}
      stopPropagation={stopPropagation}
      iconSize={iconSize}
    >
      <CopyOutlined color={copied ? Colors.Success : undefined} />
    </IconActionButton>
  )
}

export default CopyButton
