/** @jsx jsx */
import { React, css, jsx } from 'jimu-core'
import { Button, Tooltip } from 'jimu-ui'
import { DownOutlined } from 'jimu-icons/outlined/directional/down'
import { RightOutlined } from 'jimu-icons/outlined/directional/right'
import { ButtonType, IconSize, HtmlButtonType, Colors, AriaRole } from '../enums'

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

// Native <button> picks up Calcite/UA defaults (column flex + white fill)
// on EXB 1.18–1.20. Jimu Button (tertiary + unstyled) owns the chrome;
// inline styles plus a doubled-class Emotion reset keep the chevron in a
// row even if Calcite uses !important.
const styles = {
  base: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%'
  },
  section: { padding: '8px 0' },
  card: { padding: 8 },
  toggleButton: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textAlign: 'left',
    padding: 0,
    margin: 0,
    border: 'none',
    borderRadius: 0,
    boxShadow: 'none',
    background: Colors.Transparent,
    backgroundColor: Colors.Transparent,
    color: 'inherit',
    font: 'inherit',
    lineHeight: 'inherit',
    cursor: 'pointer',
    appearance: 'none',
    WebkitAppearance: 'none'
  },
  icon: {
    marginRight: 8,
    flexShrink: 0,
    display: 'inline-flex',
    flexDirection: 'row',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  }
} as const satisfies Record<string, React.CSSProperties>

// Template form is required: Emotion's object `css()` types reject both
// the `&&` nest and values like `"row !important"`. :focus-visible also
// cannot be expressed inline.
const toggleButtonResetStyle = css`
  && {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: flex-start !important;
    background: ${Colors.Transparent} !important;
    background-color: ${Colors.Transparent} !important;
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    padding: 0 !important;
    margin: 0 !important;
    min-height: 0 !important;
    color: inherit !important;
    font: inherit !important;
    line-height: inherit !important;
    appearance: none !important;
    -webkit-appearance: none !important;
  }
  &:focus {
    outline: none;
  }
  &:focus-visible {
    outline: 2px solid ${Colors.FocusOutline};
    outline-offset: 2px;
    border-radius: 2px;
  }
`

/**
 * A reusable collapsible header component following WCAG 2.1 accessibility guidelines.
 * Uses Jimu's Button so EXB 1.18–1.20 Calcite styles cannot restyle the
 * toggle into a white column button.
 *
 * Accessibility features:
 * - Semantic button for keyboard accessibility
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
      <Button
        type={ButtonType.Tertiary}
        unstyled
        disableHoverEffect
        htmlType={HtmlButtonType.Button}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
        aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${label}`}
        style={styles.toggleButton}
        css={toggleButtonResetStyle}
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
      </Button>
      {actions && (
        <div style={styles.actions}>
          {actions}
        </div>
      )}
    </div>
  )
}

export default CollapsibleHeader
