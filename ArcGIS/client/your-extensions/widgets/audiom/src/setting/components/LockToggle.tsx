import { React, css } from 'jimu-core'
import { Button, Tooltip } from 'jimu-ui'
import { LockOutlined } from 'jimu-icons/outlined/editor/lock'
import { UnlockOutlined } from 'jimu-icons/outlined/editor/unlock'
import { ButtonSize, ButtonType } from '../enums'

const lockButtonStyle = css({
  padding: 2,
  minWidth: 'auto',
  background: 'transparent',
  border: 'none'
})

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
 * Lock/Unlock toggle button shared across settings UI.
 * Tooltip + aria-label switch with state. Caller supplies both strings
 * so different contexts (latitude, filter, source visibility) can localize.
 */
const LockToggle = (props: LockToggleProps) => {
  const { locked, onToggle, unlockTooltip, lockTooltip, iconSize = 12, stopPropagation = false } = props
  const tooltip = locked ? unlockTooltip : lockTooltip
  const Icon = locked ? LockOutlined : UnlockOutlined

  const handleClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.stopPropagation()
    }
    onToggle()
  }

  return (
    <Tooltip title={tooltip}>
      <Button
        type={ButtonType.Tertiary}
        size={ButtonSize.Small}
        onClick={handleClick}
        aria-label={tooltip}
        css={lockButtonStyle}
      >
        <Icon size={iconSize} />
      </Button>
    </Tooltip>
  )
}

export default LockToggle
