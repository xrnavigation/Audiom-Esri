import { React } from 'jimu-core'
import { DownOutlined } from 'jimu-icons/outlined/directional/down'
import { RightOutlined } from 'jimu-icons/outlined/directional/right'
import { IconSize, HtmlButtonType } from '../enums'
import '../../styles/widget.css'

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

  const levelClass = level === CollapsibleHeaderLevel.Section 
    ? 'audiom-collapsible-header--section' 
    : 'audiom-collapsible-header--card'

  const headerStyle: React.CSSProperties = backgroundColor ? { backgroundColor } : {}

  return (
    <div 
      className={`audiom-collapsible-header ${levelClass}`}
      style={headerStyle}
      role="heading" 
      aria-level={3}
    >
      <button
        type={HtmlButtonType.Button}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
        aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${label}`}
        className="audiom-collapsible-header__toggle"
      >
        <span className="audiom-collapsible-header__icon" aria-hidden="true">
          {isOpen ? <DownOutlined size={IconSize.Small} /> : <RightOutlined size={IconSize.Small} />}
        </span>
        <span className="audiom-collapsible-header__label">{label}</span>
      </button>
      {actions && (
        <div className="audiom-collapsible-header__actions">
          {actions}
        </div>
      )}
    </div>
  )
}

export default CollapsibleHeader
