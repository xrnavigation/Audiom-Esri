import { React } from 'jimu-core'
import { Label, Tooltip } from 'jimu-ui'
import { CopyOutlined } from 'jimu-icons/outlined/editor/copy'

const { useState, useCallback } = React

interface CopyableLabelProps {
  /** The display text for the label */
  label: string
  /** The value to copy to clipboard (defaults to label if not provided) */
  copyValue?: string
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
  const { label, copyValue, style } = props
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
      console.error('Failed to copy to clipboard:', err)
    }
  }, [copyValue, label])

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      width: '100%', 
      marginBottom: '4px',
      ...style 
    }}>
      <Label style={{ flex: 1, marginBottom: 0 }}>{label}</Label>
      <Tooltip title={copied ? TOOLTIP_COPIED : TOOLTIP_COPY} placement="top">
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copy ${label} key`}
          style={{
            background: 'none',
            border: 'none',
            padding: '2px',
            cursor: 'pointer',
            opacity: 0.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'opacity 0.2s ease',
            marginLeft: '4px'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5' }}
        >
          <CopyOutlined size={12} color={copied ? '#10b981' : '#6b7280'} />
        </button>
      </Tooltip>
    </div>
  )
}

export default CopyableLabel
