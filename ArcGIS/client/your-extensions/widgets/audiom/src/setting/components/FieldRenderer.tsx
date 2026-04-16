import { React } from 'jimu-core'
import { SettingRow } from 'jimu-ui/advanced/setting-components'
import { TextInput, NumericInput, Switch, Select, Option, Label } from 'jimu-ui'
import { FieldConfig, IAudiomConfig } from '../configs'
import { FieldType, FlowType, Colors } from '../enums'
import CopyableLabel from './CopyableLabel'
import CoordinatePairInput from './CoordinatePairInput'
import LockableField, { LockableFieldType } from './LockableField'

/** Runtime props for CoordinatePair fields, resolved by the caller */
export interface CoordinatePairRuntimeProps {
  lngValue: number
  latLocked?: boolean
  lngLocked?: boolean
  showLockButton?: boolean
  onLatLockToggle?: () => void
  onLngLockToggle?: () => void
}

interface FieldRendererProps {
  /** The field configuration defining type, label, validation, etc. */
  field: FieldConfig
  /** The current value of the field */
  value: unknown
  /** Callback when the field value changes */
  onChange: (key: string, value: unknown) => void
  /** Whether the field is read-only/disabled */
  disabled?: boolean
  /** Optional suffix text to display after the label (e.g., current value preview) */
  labelSuffix?: string
  /** Whether the field is locked (for lockable fields) */
  locked?: boolean
  /** Whether to show the lock button (for lockable fields) */
  showLockButton?: boolean
  /** Callback when lock toggle is clicked (for lockable fields) */
  onLockToggle?: () => void
  /** Runtime props for CoordinatePair fields */
  coordinatePairProps?: CoordinatePairRuntimeProps
}

/**
 * A shared field renderer component that renders form fields based on FieldConfig.
 * Eliminates duplication between setting.tsx and SourceConfigList.tsx.
 * 
 * Supports the following field types:
 * - Text: Single-line text input
 * - Password: Password input with masked characters
 * - Number: Numeric input with optional min/max validation
 * - Switch: Boolean toggle switch
 * - Enum: Dropdown select with predefined options
 * - Custom: Renders custom content via renderCustom callback
 * 
 * Accessibility features:
 * - Proper label association with form controls
 * - Disabled state support for read-only fields
 * - Validation feedback on blur/accept
 */
const FieldRenderer = (props: FieldRendererProps) => {
  const {
    field, value, onChange, disabled = false, labelSuffix,
    locked, showLockButton, onLockToggle,
    coordinatePairProps
  } = props

  const handleChange = (newValue: unknown) => {
    onChange(field.key, newValue)
  }

  // If field is lockable and has lockable config, render LockableField
  if (field.lockable && field.lockableFieldName !== undefined) {
    const lockableType = field.type === FieldType.Number ? LockableFieldType.Number : LockableFieldType.Text
    return (
      <React.Fragment key={field.key}>
        <LockableField
          label={field.label}
          value={field.type === FieldType.Number ? (value as number) : String(value ?? '')}
          locked={locked ?? false}
          showLockButton={showLockButton ?? false}
          onLockToggle={onLockToggle ?? (() => {})}
          onChange={handleChange}
          type={lockableType}
          min={field.min}
          max={field.max}
          placeholder={field.placeholder}
        />
        {field.renderAfter?.()}
      </React.Fragment>
    )
  }

  const renderLabel = () => {
    if (labelSuffix) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
          <CopyableLabel 
            label={field.label} 
            copyValue={String(value ?? '')} 
            showCopyButton={field.showCopyButton} 
          />
          <Label style={{ color: Colors.TextMuted, fontSize: '12px', whiteSpace: 'nowrap', marginLeft: '8px', flex: '1', textAlign: 'right' }}>
            {labelSuffix}
          </Label>
        </div>
      )
    }
    return (
      <CopyableLabel 
        label={field.label} 
        copyValue={String(value ?? '')} 
        showCopyButton={field.showCopyButton} 
      />
    )
  }

  const renderFieldContent = () => {
    switch (field.type) {
      case FieldType.Text:
        return (
          <SettingRow flow={FlowType.Wrap}>
            {renderLabel()}
            <TextInput
              style={{ width: '100%' }}
              value={String(value ?? '')}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={field.placeholder}
              disabled={disabled}
              checkValidityOnAccept={field.validateOnAccept ? (text) => field.validateOnAccept!(text) : undefined}
              aria-label={field.label}
            />
          </SettingRow>
        )

      case FieldType.Password:
        return (
          <SettingRow flow={FlowType.Wrap}>
            {renderLabel()}
            <TextInput
              style={{ width: '100%' }}
              type="password"
              value={String(value ?? '')}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={field.placeholder}
              disabled={disabled}
              aria-label={field.label}
            />
          </SettingRow>
        )

      case FieldType.Number:
        return (
          <SettingRow flow={FlowType.Wrap}>
            {renderLabel()}
            <NumericInput
              style={{ width: '100%' }}
              value={value as number}
              onChange={(val) => handleChange(val)}
              min={field.min}
              max={field.max}
              disabled={disabled}
              aria-label={field.label}
            />
          </SettingRow>
        )

      case FieldType.Switch:
        return (
          <SettingRow flow={FlowType.Wrap}>
            {renderLabel()}
            <Switch
              checked={Boolean(value)}
              onChange={(e) => handleChange(e.target.checked)}
              disabled={disabled}
              aria-label={field.label}
            />
          </SettingRow>
        )

      case FieldType.Enum:
        return (
          <SettingRow flow={FlowType.Wrap}>
            {renderLabel()}
            <Select
              style={{ width: '100%' }}
              value={String(value ?? field.defaultValue ?? '')}
              onChange={(e) => handleChange(e.target.value)}
              disabled={disabled}
              aria-label={field.label}
            >
              {field.enumOptions?.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </SettingRow>
        )

      case FieldType.Custom:
        return (
          <SettingRow flow={FlowType.Wrap}>
            {renderLabel()}
            {field.renderCustom?.()}
          </SettingRow>
        )

      case FieldType.CoordinatePair: {
        const cp = coordinatePairProps
        const cpConfig = field.coordinatePair
        return (
          <SettingRow flow={FlowType.Wrap}>
            <CopyableLabel label={field.label} copyValue={String(value ?? '')} showCopyButton={false} />
            <CoordinatePairInput
              latitude={value as number}
              longitude={cp?.lngValue ?? 0}
              onLatChange={(val) => handleChange(val)}
              onLngChange={(val) => onChange(cpConfig!.lngKey, val)}
              latDisabled={cp?.latLocked}
              lngDisabled={cp?.lngLocked}
              latLock={cp?.showLockButton && cp?.onLatLockToggle ? { locked: cp.latLocked ?? false, onToggle: cp.onLatLockToggle } : undefined}
              lngLock={cp?.showLockButton && cp?.onLngLockToggle ? { locked: cp.lngLocked ?? false, onToggle: cp.onLngLockToggle } : undefined}
              latLabel={cpConfig?.latLabel}
              lngLabel={cpConfig?.lngLabel}
              showCopyButton={field.showCopyButton}
              compact={cpConfig?.compact}
            />
          </SettingRow>
        )
      }

      default:
        return null
    }
  }

  return (
    <React.Fragment key={field.key}>
      {renderFieldContent()}
      {field.renderAfter?.()}
    </React.Fragment>
  )
}

export default FieldRenderer
