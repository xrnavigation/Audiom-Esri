import { React } from 'jimu-core'
import { LockOutlined } from 'jimu-icons/outlined/editor/lock'
import { UnlockOutlined } from 'jimu-icons/outlined/editor/unlock'
import IconActionButton from './IconActionButton'

export interface LockToggleProps {
  /** Whether the field is currently locked (synced with map) */
  locked: boolean
  /** Toggle handler */
  onToggle: () => void
  /** Tooltip + aria-label shown while currently locked (clicking will unlock) */
  unlockTooltip: string
  /** Tooltip + aria-label shown while currently unlocked (clicking will lock) */
  lockTooltip: string
  /** Icon size in px (default 12) */
  iconSize?: number
  /** Stop click propagation (use when nested inside a clickable header) */
  stopPropagation?: boolean
}

/**
 * Lock/Unlock toggle button shared across the settings UI.
 * Built on IconActionButton so the locked and unlocked glyphs share the
 * same square footprint (eliminating the rectangular look caused by the
 * wider unlock icon) and match other small action buttons.
 */
const LockToggle = (props: LockToggleProps) => {
  const { locked, onToggle, unlockTooltip, lockTooltip, iconSize, stopPropagation = false } = props
  const tooltip = locked ? unlockTooltip : lockTooltip
  const Icon = locked ? LockOutlined : UnlockOutlined

  return (
    <IconActionButton
      tooltip={tooltip}
      ariaLabel={tooltip}
      onClick={onToggle}
      stopPropagation={stopPropagation}
      active={locked}
      iconSize={iconSize}
    >
      <Icon />
    </IconActionButton>
  )
}

export default LockToggle
