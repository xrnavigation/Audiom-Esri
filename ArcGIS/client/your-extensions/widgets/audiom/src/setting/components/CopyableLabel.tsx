import { React } from 'jimu-core'
import { Label } from 'jimu-ui'
import CopyButton from './CopyButton'

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

/**
 * A label component with a small copy icon that copies the specified value to clipboard.
 * The icon appears to the right of the label text and is styled to be unobtrusive.
 */
const CopyableLabel = (props: CopyableLabelProps) => {
  const { label, copyValue, showCopyButton = true, style } = props

  return (
    <div style={{ ...styles.container, ...style }}>
      <Label style={styles.label}>{label}</Label>
      {showCopyButton && (
        <CopyButton
          value={copyValue ?? label}
          ariaLabel={`Copy ${label} value to clipboard`}
          stopPropagation
        />
      )}
    </div>
  )
}

export default CopyableLabel

