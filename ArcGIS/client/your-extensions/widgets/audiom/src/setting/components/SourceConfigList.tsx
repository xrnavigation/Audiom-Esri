import { React } from 'jimu-core'
import { SettingRow } from 'jimu-ui/advanced/setting-components'
import { TextInput, NumericInput, Switch, Select, Option, Card, Collapse, Button, Tooltip } from 'jimu-ui'
import { VisibleOutlined } from 'jimu-icons/outlined/application/visible'
import { InvisibleOutlined } from 'jimu-icons/outlined/application/invisible'
import { LockOutlined } from 'jimu-icons/outlined/editor/lock'
import { UnlockOutlined } from 'jimu-icons/outlined/editor/unlock'
import { MapType } from '../../../../../shared/audiom-client/AudiomSource'
import { FieldConfig, ISourceConfig } from '../configs'
import { ButtonSize, ButtonType, FieldType, FlowType, Colors } from '../enums'
import { SourceConfigKey } from '../configKeys'
import CopyableLabel from './CopyableLabel'
import { validateUrl } from '../validation/validation'
import CollapsibleHeader, { CollapsibleHeaderLevel } from './CollapsibleHeader'

const { useState } = React

// UI Text Constants
const HEADING_TEXT = 'Source Configurations'
const SOURCE_PREFIX = 'Source '
const BUTTON_REMOVE = 'Remove'
const TOOLTIP_SHOW = 'Show source'
const TOOLTIP_HIDE = 'Hide source'
const TOOLTIP_LOCK = 'Lock to sync with map'
const TOOLTIP_UNLOCK = 'Unlock to manually control visibility'
const BUTTON_ADD = 'Add Source Configuration'

// Field Configuration Constants
const FIELD_LABEL_NAME = 'Name'
const FIELD_LABEL_SOURCE_URL = 'Source URL'
const FIELD_LABEL_RULES_URL = 'Rules File URL'
const FIELD_LABEL_SOURCE = 'Source'
const FIELD_LABEL_MAP_TYPE = 'Map Type'

const PLACEHOLDER_NAME = 'Enter source display name'
const PLACEHOLDER_SOURCE_URL = 'Enter map source URL'
const PLACEHOLDER_RULES_URL = 'Enter rules file URL'
const PLACEHOLDER_SOURCE = 'Enter source identifier (e.g., units)'

const MAP_TYPE_LABEL_TRAVEL = 'Travel'
const MAP_TYPE_LABEL_HEATMAP = 'Heatmap'
const MAP_TYPE_LABEL_INDOOR = 'Indoor'

interface SourceConfigListProps {
  sourceConfigs: ISourceConfig[]
  onChange: (sourceConfigs: ISourceConfig[]) => void
  readOnly?: boolean
}

const SourceConfigList = (props: SourceConfigListProps) => {
  const { sourceConfigs, onChange, readOnly = false } = props
  const [sourceConfigsOpen, setSourceConfigsOpen] = useState(true)
  const [expandedSources, setExpandedSources] = useState<{ [key: number]: boolean }>({})

  const toggleSourceExpanded = (index: number) => {
    setExpandedSources(prev => ({
      ...prev,
      [index]: prev[index] !== undefined ? !prev[index] : false
    }))
  }

  const onSourceConfigChange = (index: number, property: string, value: any) => {
    const newSourceConfigs = [...sourceConfigs]
    newSourceConfigs[index] = { ...newSourceConfigs[index], [property]: value }
    onChange(newSourceConfigs)
  }

  const onAddSourceConfig = () => {
    const newSourceConfigs = [...sourceConfigs]
    newSourceConfigs.push({})
    onChange(newSourceConfigs)
  }

  const onRemoveSourceConfig = (index: number) => {
    const newSourceConfigs = [...sourceConfigs]
    newSourceConfigs.splice(index, 1)
    onChange(newSourceConfigs)
  }

  const onToggleSourceEnabled = (index: number) => {
    const newSourceConfigs = [...sourceConfigs]
    const currentEnabled = newSourceConfigs[index].enabled ?? true
    // Auto-unlock when manually toggling visibility
    newSourceConfigs[index] = { 
      ...newSourceConfigs[index], 
      enabled: !currentEnabled,
      locked: false 
    }
    onChange(newSourceConfigs)
  }

  const onToggleLocked = (index: number) => {
    const newSourceConfigs = [...sourceConfigs]
    const currentLocked = newSourceConfigs[index].locked ?? true
    newSourceConfigs[index] = { ...newSourceConfigs[index], locked: !currentLocked }
    // If re-locking, the sync manager will restore the enabled state on next sync
    onChange(newSourceConfigs)
  }

  const sourceConfigFields: FieldConfig[] = [
    { key: SourceConfigKey.Name, label: FIELD_LABEL_NAME, type: FieldType.Text, placeholder: PLACEHOLDER_NAME },
    { key: SourceConfigKey.SourceUrl, label: FIELD_LABEL_SOURCE_URL, type: FieldType.Text, placeholder: PLACEHOLDER_SOURCE_URL, validateOnAccept: (val) => validateUrl(String(val)) },
    { key: SourceConfigKey.RulesFileUrl, label: FIELD_LABEL_RULES_URL, type: FieldType.Text, placeholder: PLACEHOLDER_RULES_URL, validateOnAccept: (val) => validateUrl(String(val)) },
    { key: SourceConfigKey.Source, label: FIELD_LABEL_SOURCE, type: FieldType.Text, placeholder: PLACEHOLDER_SOURCE },
    {
      key: SourceConfigKey.MapType,
      label: FIELD_LABEL_MAP_TYPE,
      type: FieldType.Enum,
      enumOptions: [
        { label: MAP_TYPE_LABEL_TRAVEL, value: MapType.Travel },
        { label: MAP_TYPE_LABEL_HEATMAP, value: MapType.Heatmap },
        { label: MAP_TYPE_LABEL_INDOOR, value: MapType.Indoor }
      ],
      defaultValue: MapType.Indoor,
      showCopyButton: false
    }
  ]

  const renderSourceField = (field: FieldConfig, index: number) => {
    const sourceConfig = sourceConfigs[index] || {}
    const value = sourceConfig[field.key] ?? field.defaultValue
    
    // MapType and RulesFileUrl remain editable even when readOnly is true
    const isFieldDisabled = readOnly && field.key !== SourceConfigKey.MapType && field.key !== SourceConfigKey.RulesFileUrl

    switch (field.type) {
      case FieldType.Text:
        return (
          <SettingRow key={field.key} flow={FlowType.Wrap}>
            <CopyableLabel label={field.label} copyValue={String(value || '')} showCopyButton={field.showCopyButton} />
            <TextInput
              style={{ width: '100%' }}
              value={value || ''}
              onChange={(e) => onSourceConfigChange(index, field.key, e.target.value)}
              placeholder={field.placeholder}
              disabled={isFieldDisabled}
              checkValidityOnAccept={field.validateOnAccept ? (text) => field.validateOnAccept(text) : undefined}
            />
          </SettingRow>
        )
      case FieldType.Number:
        return (
          <SettingRow key={field.key} flow={FlowType.Wrap}>
            <CopyableLabel label={field.label} copyValue={String(value ?? '')} showCopyButton={field.showCopyButton} />
            <NumericInput
              style={{ width: '100%' }}
              value={value}
              onChange={(val) => onSourceConfigChange(index, field.key, val)}
              min={field.min}
              max={field.max}
              disabled={isFieldDisabled}
            />
          </SettingRow>
        )
      case FieldType.Switch:
        return (
          <SettingRow key={field.key} flow={FlowType.Wrap}>
            <CopyableLabel label={field.label} copyValue={String(value)} showCopyButton={field.showCopyButton} />
            <Switch
              checked={value}
              onChange={(e) => onSourceConfigChange(index, field.key, e.target.checked)}
              disabled={isFieldDisabled}
            />
          </SettingRow>
        )
      case FieldType.Enum:
        return (
          <SettingRow key={field.key} flow={FlowType.Wrap}>
            <CopyableLabel label={field.label} copyValue={String(value || field.defaultValue || '')} showCopyButton={field.showCopyButton} />
            <Select
              style={{ width: '100%' }}
              value={value || field.defaultValue}
              onChange={(e) => onSourceConfigChange(index, field.key, e.target.value)}
              disabled={isFieldDisabled}
            >
              {field.enumOptions?.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </SettingRow>
        )
    }
  }

  return (
    <div>
      {/* Source Configurations header */}
      <CollapsibleHeader
        label={HEADING_TEXT}
        isOpen={sourceConfigsOpen}
        onToggle={() => setSourceConfigsOpen(!sourceConfigsOpen)}
      />
      <Collapse isOpen={sourceConfigsOpen}>
        {sourceConfigs.map((sourceConfig, index) => {
          const isExpanded = expandedSources[index] !== undefined ? expandedSources[index] : true
          const sourceName = sourceConfig?.name && sourceConfig.name.trim() ? sourceConfig.name : `${SOURCE_PREFIX}${index + 1}`
          const isEnabled = sourceConfig.enabled !== false

          return (
            <Card
              key={index}
              style={{ marginBottom: '12px', border: '0px' }}
            >
              {/* Source header with expand/collapse and action buttons */}
              <CollapsibleHeader
                label={sourceName}
                isOpen={isExpanded}
                onToggle={() => toggleSourceExpanded(index)}
                backgroundColor={Colors.HeaderBackground}
                level={CollapsibleHeaderLevel.Card}
                actions={
                  readOnly ? (
                    <>
                      <Tooltip title={(sourceConfig.locked ?? true) ? TOOLTIP_UNLOCK : TOOLTIP_LOCK}>
                        <Button
                          size={ButtonSize.Small}
                          type={ButtonType.Tertiary}
                          icon
                          onClick={(e) => {
                            e.stopPropagation()
                            onToggleLocked(index)
                          }}
                          aria-label={(sourceConfig.locked ?? true) ? TOOLTIP_UNLOCK : TOOLTIP_LOCK}
                          style={{ marginLeft: '4px' }}
                        >
                          {(sourceConfig.locked ?? true) ? <LockOutlined /> : <UnlockOutlined />}
                        </Button>
                      </Tooltip>
                      <Tooltip title={isEnabled ? TOOLTIP_HIDE : TOOLTIP_SHOW}>
                        <Button
                          size={ButtonSize.Small}
                          type={ButtonType.Tertiary}
                          icon
                          onClick={(e) => {
                            e.stopPropagation()
                            onToggleSourceEnabled(index)
                          }}
                          aria-label={isEnabled ? TOOLTIP_HIDE : TOOLTIP_SHOW}
                          style={{ marginLeft: '4px' }}
                        >
                          {isEnabled ? <VisibleOutlined /> : <InvisibleOutlined />}
                        </Button>
                      </Tooltip>
                    </>
                  ) : (
                    <Button
                      size={ButtonSize.Small}
                      type={ButtonType.Danger}
                      onClick={() => onRemoveSourceConfig(index)}
                      aria-label={`${BUTTON_REMOVE} ${sourceName}`}
                    >
                      {BUTTON_REMOVE}
                    </Button>
                  )
                }
              />
              {/* Smooth collapse animation */}
              <Collapse isOpen={isExpanded}>
                <div style={{ padding: '12px' }}>
                  {sourceConfigFields.map((field) => renderSourceField(field, index))}
                </div>
              </Collapse>
            </Card>
          )
        })}
        {!readOnly && (
          <SettingRow>
            <Button
              size={ButtonSize.Small}
              type={ButtonType.Primary}
              onClick={onAddSourceConfig}
            >
              {BUTTON_ADD}
            </Button>
          </SettingRow>
        )}
      </Collapse>
    </div>
  )
}

export default SourceConfigList
