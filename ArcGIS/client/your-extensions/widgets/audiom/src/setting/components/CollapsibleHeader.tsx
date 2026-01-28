import { React, css } from 'jimu-core'
import { DownOutlined } from 'jimu-icons/outlined/directional/down'
import { RightOutlined } from 'jimu-icons/outlined/directional/right'
import { IconSize, HtmlButtonType } from '../enums'

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

// Styles
const styles = {
  base: css`
    display: flex;
    align-items: center;
    width: 100%;
  `,
  section: css`padding: 8px 0;`,
  card: css`padding: 8px;`,
  toggle: css`
    display: flex;
    align-items: center;
    flex: 1;
    justify-content: flex-start;
    text-align: left;
    padding: 0;
    margin: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid var(--sys-color-primary-main, #0079c1);
      outline-offset: 2px;
      border-radius: 2px;
    }
  `,
  icon: css`
    margin-right: 8px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
  `,
  label: css`
    font-weight: 500;
    flex: 1;
  `,
  actions: css`
    display: flex;
    align-items: center;
    gap: 4px;
  `
} as const

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

  const levelStyle = level === CollapsibleHeaderLevel.Section ? styles.section : styles.card
  const headerStyle: React.CSSProperties = backgroundColor ? { backgroundColor } : {}

  return (
    <div 
      css={[styles.base, levelStyle]}
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
        css={styles.toggle}
      >
        <span css={styles.icon} aria-hidden="true">
          {isOpen ? <DownOutlined size={IconSize.Small} /> : <RightOutlined size={IconSize.Small} />}
        </span>
        <span css={styles.label}>{label}</span>
      </button>
      {actions && (
        <div css={styles.actions}>
          {actions}
        </div>
      )}
    </div>
  )
}

export default CollapsibleHeader
