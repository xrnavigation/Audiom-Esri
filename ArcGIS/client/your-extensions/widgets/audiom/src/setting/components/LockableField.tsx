import { React, css } from 'jimu-core'
import { SettingRow } from 'jimu-ui/advanced/setting-components'
import { NumericInput, Label, Button, Tooltip, TextInput } from 'jimu-ui'
import { LockOutlined } from 'jimu-icons/outlined/editor/lock'
import { UnlockOutlined } from 'jimu-icons/outlined/editor/unlock'
import CopyableLabel from './CopyableLabel'
import { ButtonSize, ButtonType, FlowType } from '../enums'

/** Field type for lockable fields */
export enum LockableFieldType {
  Text = 'text',
  Number = 'number'
}

export interface LockableFieldProps {
  /** Field label */
  label: string
  /** Current value */
  value: string | number
  /** Whether the field is locked (synced with map) */
  locked: boolean
  /** Whether to show the lock button (only when synced to a map) */
  showLockButton: boolean
  /** Callback when lock state toggles */
  onLockToggle: () => void
  /** Callback when value changes */
  onChange: (value: string | number) => void
  /** Field type - 'text' or 'number' */
  type: LockableFieldType
  /** Placeholder text for text inputs */
  placeholder?: string
  /** Min value for number inputs */
  min?: number
  /** Max value for number inputs */
  max?: number
}

const lockButtonStyle = css({
  padding: '2px',
  minWidth: 'auto',
  background: 'transparent',
  border: 'none'
})

const labelRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  marginBottom: 4
}

const labelStyle: React.CSSProperties = {
  flex: 1,
  marginBottom: 0
}

/**
 * A field component that supports lock/unlock functionality for map syncing.
 * When locked, the field is disabled and syncs with the map value.
 * When unlocked, the field is editable and uses the manual value.
 */
const LockableField = (props: LockableFieldProps) => {
  const {
    label,
    value,
    locked,
    showLockButton,
    onLockToggle,
    onChange,
    type,
    placeholder,
    min,
    max
  } = props

  const stringValue = String(value ?? '')

  // If not showing lock button (not synced to a map), render simple field
  if (!showLockButton) {
    return (
      <SettingRow flow={FlowType.Wrap}>
        <CopyableLabel label={label} copyValue={stringValue} />
        {type === LockableFieldType.Text ? (
          <TextInput
            style={{ width: '100%' }}
            value={stringValue}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            aria-label={label}
          />
        ) : (
          <NumericInput
            style={{ width: '100%' }}
            value={value as number}
            onChange={(val) => onChange(val)}
            min={min}
            max={max}
            aria-label={label}
          />
        )}
      </SettingRow>
    )
  }

  // Synced to a map - show lock/unlock button
  const lockTooltip = locked
    ? `Unlock to edit ${label.toLowerCase()} manually`
    : `Lock to sync with map`

  return (
    <SettingRow flow={FlowType.Wrap}>
      <div style={labelRowStyle}>
        <Label style={labelStyle}>{label}</Label>
        <Tooltip title={lockTooltip}>
          <Button
            type={ButtonType.Tertiary}
            size={ButtonSize.Small}
            onClick={onLockToggle}
            aria-label={locked ? `Unlock ${label.toLowerCase()}` : `Lock ${label.toLowerCase()}`}
            css={lockButtonStyle}
          >
            {locked ? <LockOutlined size={12} /> : <UnlockOutlined size={12} />}
          </Button>
        </Tooltip>
        <CopyableLabel label="" copyValue={stringValue} style={{ width: 'auto', marginBottom: 0 }} />
      </div>
      {type === LockableFieldType.Text ? (
        <TextInput
          style={{ width: '100%' }}
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={locked}
          aria-label={label}
        />
      ) : (
        <NumericInput
          style={{ width: '100%' }}
          value={value as number}
          onChange={(val) => onChange(val)}
          min={min}
          max={max}
          disabled={locked}
          aria-label={label}
        />
      )}
    </SettingRow>
  )
}

export default LockableField
