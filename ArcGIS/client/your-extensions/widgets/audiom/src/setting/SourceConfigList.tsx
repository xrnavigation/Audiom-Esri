import { React } from 'jimu-core'
import { SettingRow } from 'jimu-ui/advanced/setting-components'
import { TextInput, NumericInput, Switch, Label, Select, Option, Collapse, Button } from 'jimu-ui'
import { MapType } from '../../../../shared/audiom-client/AudiomSource'
import { FieldConfig, ISourceConfig } from './configs'
import { ButtonSize, ButtonType, FieldType, FlowType } from './enums'

const { useState } = React

// UI Text Constants
const ARROW_DOWN = '▼'
const ARROW_RIGHT = '▶'
const HEADING_TEXT = 'Source Configurations'
const ACTION_COLLAPSE = 'Collapse'
const ACTION_EXPAND = 'Expand'
const SECTION_LABEL = 'Source Configurations section'
const SOURCE_PREFIX = 'Source '
const BUTTON_REMOVE = 'Remove'
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

  const sourceConfigFields: FieldConfig[] = [
    { key: 'name', label: FIELD_LABEL_NAME, type: FieldType.Text, placeholder: PLACEHOLDER_NAME },
    { key: 'sourceUrl', label: FIELD_LABEL_SOURCE_URL, type: FieldType.Text, placeholder: PLACEHOLDER_SOURCE_URL },
    { key: 'rulesFileUrl', label: FIELD_LABEL_RULES_URL, type: FieldType.Text, placeholder: PLACEHOLDER_RULES_URL },
    { key: 'source', label: FIELD_LABEL_SOURCE, type: FieldType.Text, placeholder: PLACEHOLDER_SOURCE },
    {
      key: 'mapType',
      label: FIELD_LABEL_MAP_TYPE,
      type: FieldType.Enum,
      enumOptions: [
        { label: MAP_TYPE_LABEL_TRAVEL, value: MapType.Travel },
        { label: MAP_TYPE_LABEL_HEATMAP, value: MapType.Heatmap },
        { label: MAP_TYPE_LABEL_INDOOR, value: MapType.Indoor }
      ],
      defaultValue: MapType.Indoor
    }
  ]

  const renderSourceField = (field: FieldConfig, index: number) => {
    const sourceConfig = sourceConfigs[index] || {}
    const value = sourceConfig[field.key] ?? field.defaultValue

    switch (field.type) {
      case FieldType.Text:
        return (
          <SettingRow key={field.key} flow={FlowType.Wrap}>
            <Label style={{ width: '100%', marginBottom: '4px' }}>{field.label}</Label>
            <TextInput
              style={{ width: '100%' }}
              value={value || ''}
              onChange={(e) => onSourceConfigChange(index, field.key, e.target.value)}
              placeholder={field.placeholder}
              disabled={readOnly}
            />
          </SettingRow>
        )
      case FieldType.Number:
        return (
          <SettingRow key={field.key} flow={FlowType.Wrap}>
            <Label style={{ width: '100%', marginBottom: '4px' }}>{field.label}</Label>
            <NumericInput
              style={{ width: '100%' }}
              value={value}
              onChange={(val) => onSourceConfigChange(index, field.key, val)}
              min={field.min}
              max={field.max}
              disabled={readOnly}
            />
          </SettingRow>
        )
      case FieldType.Switch:
        return (
          <SettingRow key={field.key} flow={FlowType.Wrap}>
            <Label style={{ width: '100%', marginBottom: '4px' }}>{field.label}</Label>
            <Switch
              checked={value}
              onChange={(e) => onSourceConfigChange(index, field.key, e.target.checked)}
              disabled={readOnly}
            />
          </SettingRow>
        )
      case FieldType.Enum:
        return (
          <SettingRow key={field.key} flow={FlowType.Wrap}>
            <Label style={{ width: '100%', marginBottom: '4px' }}>{field.label}</Label>
            <Select
              style={{ width: '100%' }}
              value={value || field.defaultValue}
              onChange={(e) => onSourceConfigChange(index, field.key, e.target.value)}
              disabled={readOnly}
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
    <>
      <SettingRow>
        <Button
          size={ButtonSize.Small}
          type={ButtonType.Tertiary}
          onClick={() => setSourceConfigsOpen(!sourceConfigsOpen)}
          aria-expanded={sourceConfigsOpen}
          aria-controls="source-configs-panel"
          aria-label={`${sourceConfigsOpen ? ACTION_COLLAPSE : ACTION_EXPAND} ${SECTION_LABEL}`}
        >
          <span aria-hidden="true">{sourceConfigsOpen ? ARROW_DOWN : ARROW_RIGHT}</span> {HEADING_TEXT}
        </Button>
      </SettingRow>
      <Collapse
        isOpen={sourceConfigsOpen}
        role="region"
      >
        {sourceConfigs.map((sourceConfig, index) => {
          const isExpanded = expandedSources[index] !== undefined ? expandedSources[index] : true
          const sourceName = sourceConfig?.name && sourceConfig.name.trim() ? sourceConfig.name : `${SOURCE_PREFIX}${index + 1}`
          return (
            <div key={index} style={{ marginBottom: '16px', padding: '12px', border: '1px solid #ccc', borderRadius: '4px' }}>
              <SettingRow flow={FlowType.Wrap}>
                <Button
                  size={ButtonSize.Small}
                  type={ButtonType.Tertiary}
                  onClick={() => toggleSourceExpanded(index)}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? ACTION_COLLAPSE : ACTION_EXPAND} ${sourceName}`}
                  style={{ padding: '4px 8px' }}
                >
                  <span aria-hidden="true">{isExpanded ? ARROW_DOWN : ARROW_RIGHT}</span>
                </Button>
                <Label style={{ flex: 1, fontWeight: 'bold', marginLeft: '8px' }}>{sourceName}</Label>
                {!readOnly && (
                  <Button
                    size={ButtonSize.Small}
                    type={ButtonType.Danger}
                    onClick={() => onRemoveSourceConfig(index)}
                    aria-label={`${BUTTON_REMOVE} ${sourceName}`}
                  >
                    {BUTTON_REMOVE}
                  </Button>
                )}
              </SettingRow>
              <Collapse isOpen={isExpanded}>
                {sourceConfigFields.map((field) => renderSourceField(field, index))}
              </Collapse>
            </div>
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
    </>
  )
}

export default SourceConfigList
