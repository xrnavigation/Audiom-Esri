import { React, css } from 'jimu-core'
import { Tooltip } from 'jimu-ui'
import { DownOutlined } from 'jimu-icons/outlined/directional/down'
import { RightOutlined } from 'jimu-icons/outlined/directional/right'
import { IconSize, HtmlButtonType, Colors, AriaRole } from '../enums'

/**
 * Collapsible header hierarchy levels.
 */
export enum CollapsibleHeaderLevel {
  /** Top-level section header with minimal padding */
  Section = 'section',
  /** Nested card header with background and full padding */
  Card = 'card'
}

interface CollapsibleHeaderProps {
  /** The text label to display */
  label: string
  /** Whether the section is currently expanded */
  isOpen: boolean
  /** Callback when the header is clicked to toggle */
  onToggle: () => void
  /** Optional background color */
  backgroundColor?: string
  /** Optional additional content to render after the label (e.g., action buttons) */
  actions?: React.ReactNode
  /** Optional id for the controlled content region (for aria-controls) */
  contentId?: string
  /** Whether this is a top-level section header (less padding) or a nested card header */
  level?: CollapsibleHeaderLevel
  /** Whether to show a tooltip on the label (useful for truncated text) */
  showLabelTooltip?: boolean
}

// Typed styles - simple properties with full key/value validation
const styles = {
  base: {
    display: 'flex',
    alignItems: 'center',
    width: '100%'
  },
  section: { padding: '8px 0' },
  card: { padding: 8 },
  icon: {
    marginRight: 8,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center'
  },
  label: {
    fontWeight: 500,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 4
  }
} as const satisfies Record<string, React.CSSProperties>

// Button needs :focus-visible pseudo-class, so use css() with typed object
const toggleButtonStyle = css({
  display: 'flex',
  alignItems: 'center',
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  justifyContent: 'flex-start',
  textAlign: 'left',
  padding: 0,
  margin: 0,
  border: 'none',
  background: Colors.Transparent,
  color: 'inherit',
  font: 'inherit',
  cursor: 'pointer',
  '&:focus-visible': {
    outline: `2px solid ${Colors.FocusOutline}`,
    outlineOffset: 2,
    borderRadius: 2
  }
})

/**
 * A reusable collapsible header component following WCAG 2.1 accessibility guidelines.
 * Uses a native button for the expand/collapse toggle with proper ARIA attributes.
 * 
 * Accessibility features:
 * - Uses semantic <button> element for keyboard accessibility
 * - aria-expanded indicates current state to screen readers
 * - aria-controls links button to the content it controls (when contentId provided)
 * - Keyboard support: Enter and Space toggle the header
 * - Focus-visible styling for keyboard navigation
 */
const CollapsibleHeader = (props: CollapsibleHeaderProps) => {
  const { label, isOpen, onToggle, backgroundColor, actions, contentId, level = CollapsibleHeaderLevel.Section, showLabelTooltip = false } = props

  const levelStyle = level === CollapsibleHeaderLevel.Section ? styles.section : styles.card
  const containerStyle: React.CSSProperties = { ...styles.base, ...levelStyle, ...(backgroundColor ? { backgroundColor } : {}) }

  return (
    <div 
      style={containerStyle}
      role={AriaRole.Heading} 
      aria-level={3}
    >
      <button
        type={HtmlButtonType.Button}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
        aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${label}`}
        css={toggleButtonStyle}
      >
        <span style={styles.icon} aria-hidden="true">
          {isOpen ? <DownOutlined size={IconSize.Small} /> : <RightOutlined size={IconSize.Small} />}
        </span>
        {showLabelTooltip ? (
          <Tooltip title={label}>
            <span style={styles.label}>{label}</span>
          </Tooltip>
        ) : (
          <span style={styles.label}>{label}</span>
        )}
      </button>
      {actions && (
        <div style={styles.actions}>
          {actions}
        </div>
      )}
    </div>
  )
}

export default CollapsibleHeader
