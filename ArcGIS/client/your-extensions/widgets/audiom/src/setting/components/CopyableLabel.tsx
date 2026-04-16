import { React, css } from 'jimu-core'
import { Label, Tooltip } from 'jimu-ui'
import { CopyOutlined } from 'jimu-icons/outlined/editor/copy'
import { Colors } from '../enums'
import { useCopyToClipboard, TOOLTIP_COPY, TOOLTIP_COPIED } from '../useCopyToClipboard'

const { useCallback } = React

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

// Typed styles - simple properties with full key/value validation
const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    marginBottom: 4
  },
  label: {
    flex: 1,
    marginBottom: 0
  }
} as const satisfies Record<string, React.CSSProperties>

// Button needs :hover and :focus-visible pseudo-classes
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
  }
})

/**
 * A label component with a small copy icon that copies the specified value to clipboard.
 * The icon appears to the right of the label text and is styled to be unobtrusive.
 */
const CopyableLabel = (props: CopyableLabelProps) => {
  const { label, copyValue, showCopyButton = true, style } = props
  const { copied, copyToClipboard } = useCopyToClipboard()

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    copyToClipboard(copyValue ?? label)
  }, [copyValue, label, copyToClipboard])

  return (
    <div style={{ ...styles.container, ...style }}>
      <Label style={styles.label}>{label}</Label>
      {showCopyButton && (
        <Tooltip title={copied ? TOOLTIP_COPIED : TOOLTIP_COPY} placement="top">
          <button
            type="button"
            onClick={handleCopy}
            aria-label={`Copy ${label} value to clipboard`}
            css={copyButtonStyle}
          >
            <CopyOutlined size={12} color={copied ? Colors.Success : undefined} />
          </button>
        </Tooltip>
      )}
    </div>
  )
}

export default CopyableLabel
