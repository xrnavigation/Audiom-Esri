import { React } from 'jimu-core'
import { DownOutlined } from 'jimu-icons/outlined/directional/down'
import { RightOutlined } from 'jimu-icons/outlined/directional/right'
import { IconSize, Colors, HtmlButtonType } from '../enums'

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
}

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
  const { label, isOpen, onToggle, backgroundColor, actions, contentId, level = CollapsibleHeaderLevel.Section } = props

  // Section headers have minimal left padding, card headers have more padding with background
  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: level === CollapsibleHeaderLevel.Section ? '8px 0' : '8px',
    ...(backgroundColor ? { backgroundColor } : {})
  }

  const toggleButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-start',
    textAlign: 'left',
    padding: '0',
    margin: '0',
    border: 'none',
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
    cursor: 'pointer'
  }

  return (
    <div style={headerStyle} role="heading" aria-level={3}>
      <button
        type={HtmlButtonType.Button}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
        style={toggleButtonStyle}
        className="collapsible-header-toggle"
      >
        <span style={{ marginRight: '8px', display: 'flex', alignItems: 'center' }} aria-hidden="true">
          {isOpen ? <DownOutlined size={IconSize.Small} /> : <RightOutlined size={IconSize.Small} />}
        </span>
        <span style={{ flex: 1 }}>{label}</span>
      </button>
      {actions}
      <style>{`
        .collapsible-header-toggle {
          outline: none;
        }
        .collapsible-header-toggle:focus-visible {
          outline: 2px solid ${Colors.FocusOutline};
          outline-offset: 2px;
        }
      `}</style>
    </div>
  )
}

export default CollapsibleHeader
