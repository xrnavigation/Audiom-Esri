import { React } from 'jimu-core'
import type { AllWidgetSettingProps } from 'jimu-for-builder'
import { MapWidgetSelector, SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components'
import { TextInput, NumericInput, Switch, Label } from 'jimu-ui'
import { FieldType, type IAudiomConfig, type FieldConfig, type ISourceConfig } from './types'
import SourceConfigList from './SourceConfigList'

const { useState } = React

const Setting = (props: AllWidgetSettingProps<IAudiomConfig>) => {
  const { config } = props

  const onMapWidgetSelected = (useMapWidgetIds: string[]) => {
    props.onSettingChange({
      id: props.id,
      useMapWidgetIds: useMapWidgetIds,
      config: config.set('existingMapId', useMapWidgetIds[0] || '')
    })
  }

  const onPropertyChange = (property: string, value: any) => {
    props.onSettingChange({
      id: props.id,
      config: config.set(property, value)
    })
  }

  const onSourceConfigsChange = (sourceConfigs: ISourceConfig[]) => {
    props.onSettingChange({
      id: props.id,
      config: config.set('sourceConfigs', sourceConfigs)
    })
  }

  const alwaysPresentFields: FieldConfig[] = [
    { key: 'title', label: 'Title', type: FieldType.Text, placeholder: 'Enter widget title' },
    { key: 'apiKey', label: 'API Key', type: FieldType.Text, placeholder: 'Enter API key' },
    { key: 'baseUrl', label: 'Audiom Server Base URL', type: FieldType.Text, placeholder: 'Enter Audiom server URL' },
    { key: 'stepSize', label: 'Step Size', type: FieldType.Number, min: 0.1, defaultValue: 1 },
    { key: 'showVisualMap', label: 'Show Visual Map', type: FieldType.Switch, defaultValue: true },
    { key: 'showHeading', label: 'Show Heading', type: FieldType.Switch, defaultValue: false },
    { key: 'heading', label: 'Heading', type: FieldType.Number, min: 0, max: 360, defaultValue: 0 },
    { key: 'soundpackUrl', label: 'Soundpack URL', type: FieldType.Text, placeholder: 'Enter soundpack URL' }
  ]

  const urlModeFields: FieldConfig[] = [
    { key: 'centerLatitude', label: 'Center Latitude', type: FieldType.Number, defaultValue: 0 },
    { key: 'centerLongitude', label: 'Center Longitude', type: FieldType.Number, defaultValue: 0 },
    { key: 'zoom', label: 'Zoom Level', type: FieldType.Number, min: 0, max: 20, defaultValue: 10 }
  ]

  const renderField = (field: FieldConfig) => {
    const value = config?.[field.key] ?? field.defaultValue

    switch (field.type) {
      case FieldType.Text:
        return (
          <SettingRow key={field.key} flow="wrap">
            <Label style={{ width: '100%', marginBottom: '4px' }}>{field.label}</Label>
            <TextInput
              style={{ width: '100%' }}
              value={value || ''}
              onChange={(e) => onPropertyChange(field.key, e.target.value)}
              placeholder={field.placeholder}
            />
          </SettingRow>
        )
      case FieldType.Number:
        return (
          <SettingRow key={field.key} flow="wrap">
            <Label style={{ width: '100%', marginBottom: '4px' }}>{field.label}</Label>
            <NumericInput
              style={{ width: '100%' }}
              value={value}
              onChange={(val) => onPropertyChange(field.key, val)}
              min={field.min}
              max={field.max}
            />
          </SettingRow>
        )
      case FieldType.Switch:
        return (
          <SettingRow key={field.key} flow="wrap">
            <Label style={{ width: '100%', marginBottom: '4px' }}>{field.label}</Label>
            <Switch
              checked={value}
              onChange={(e) => onPropertyChange(field.key, e.target.checked)}
            />
          </SettingRow>
        )
    }
  }

  return (
    <div className="widget-setting-demo">
      <SettingSection title="Map Source">
        <SettingRow flow="wrap">
          <Label style={{ width: '100%', marginBottom: '4px' }}>Use Existing Map Widget</Label>
          <Switch
            checked={config?.useExistingMap ?? true}
            onChange={(e) => onPropertyChange('useExistingMap', e.target.checked)}
          />
        </SettingRow>

        {config?.useExistingMap ? (
          <SettingRow flow="wrap">
            <Label style={{ width: '100%', marginBottom: '4px' }}>Select Map Widget</Label>
            <MapWidgetSelector useMapWidgetIds={props.useMapWidgetIds} onSelect={onMapWidgetSelected} />
          </SettingRow>
        ) : (
          <>
            {urlModeFields.map(renderField)}
            <SourceConfigList
              sourceConfigs={config?.sourceConfigs || []}
              onChange={onSourceConfigsChange}
            />
          </>
        )}
      </SettingSection>

      <SettingSection title="Configuration">
        {alwaysPresentFields.map(renderField)}
      </SettingSection>
    </div>
  )
}

export default Setting