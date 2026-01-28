import { React } from 'jimu-core'
import { Label, Tooltip } from 'jimu-ui'
import { CopyOutlined } from 'jimu-icons/outlined/editor/copy'
import { createLogger } from '../../utils/logger'
import './CopyableLabel.css'

const { useState, useCallback } = React
const logger = createLogger('CopyableLabel')

interface CopyableLabelProps {
  /** The display text for the label */
  label: string
  /** The value to copy to clipboard (defaults to label if not provided) */
  copyValue?: string
  /** Whether to show the copy button (default: true) */
  showCopyButton?: boolean
  /** Additional styles for the label container */
  style?: React.CSSProperties
}

const TOOLTIP_COPY = 'Copy to clipboard'
const TOOLTIP_COPIED = 'Copied!'
const TOOLTIP_RESET_DELAY = 2000

/**
 * A label component with a small copy icon that copies the specified value to clipboard.
 * The icon appears to the right of the label text and is styled to be unobtrusive.
 */
const CopyableLabel = (props: CopyableLabelProps) => {
  const { label, copyValue, showCopyButton = true, style } = props
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    const textToCopy = copyValue ?? label
    
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), TOOLTIP_RESET_DELAY)
    } catch (err) {
      logger.error('Failed to copy to clipboard:', err)
    }
  }, [copyValue, label])

  return (
    <div className="audiom-copyable-label" style={style}>
      <Label className="audiom-copyable-label__text">{label}</Label>
      {showCopyButton && (
        <Tooltip title={copied ? TOOLTIP_COPIED : TOOLTIP_COPY} placement="top">
          <button
            type="button"
            onClick={handleCopy}
            aria-label={`Copy ${label} value to clipboard`}
            className="audiom-copyable-label__button"
          >
            <CopyOutlined size={12} color={copied ? '#10b981' : undefined} />
          </button>
        </Tooltip>
      )}
    </div>
  )
}

export default CopyableLabel
