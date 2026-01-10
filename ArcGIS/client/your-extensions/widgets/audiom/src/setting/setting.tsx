import { React } from 'jimu-core'
import type { AllWidgetSettingProps } from 'jimu-for-builder'
import { MapWidgetSelector, SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components'
import { TextInput, NumericInput, Switch, Label } from 'jimu-ui'

import SourceConfigList from './SourceConfigList'
import { MapViewManager } from 'jimu-arcgis'
import { extractMapConfigFromEsriMap } from '../utils/maputils'
import { FieldConfig, IAudiomConfig, ISourceConfig } from './configs'
import { FieldType, FlowType } from './enums'

const { useState, useEffect } = React

const Setting = (props: AllWidgetSettingProps<IAudiomConfig>) => {
  const { config } = props

  // Update map center and zoom from ESRI map when using existing map
  useEffect(() => {
    if (config?.useExistingMap && config?.existingMapId) {
      const mapViewManager = MapViewManager.getInstance()
      const extractedConfig = extractMapConfigFromEsriMap(config.existingMapId, mapViewManager)
      
      if (extractedConfig) {
        // Update config if values are different
        const needsUpdate = 
          config.centerLatitude !== extractedConfig.centerLatitude ||
          config.centerLongitude !== extractedConfig.centerLongitude ||
          config.zoom !== extractedConfig.zoom
        
        if (needsUpdate) {
          let newConfig = config
            .set('centerLatitude', extractedConfig.centerLatitude)
            .set('centerLongitude', extractedConfig.centerLongitude)
            .set('zoom', extractedConfig.zoom)
          
          // Update source configs if available
          if (extractedConfig.sourceConfigs) {
            newConfig = newConfig.set('sourceConfigs', extractedConfig.sourceConfigs)
          }
          
          props.onSettingChange({
            id: props.id,
            config: newConfig
          })
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.useExistingMap, config?.existingMapId])

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

  const renderField = (field: FieldConfig, readOnly: boolean = false) => {
    const value = config?.[field.key] ?? field.defaultValue

    switch (field.type) {
      case FieldType.Text:
        return (
          <SettingRow key={field.key} flow={FlowType.Wrap}>
            <Label style={{ width: '100%', marginBottom: '4px' }}>{field.label}</Label>
            <TextInput
              style={{ width: '100%' }}
              value={value || ''}
              onChange={(e) => onPropertyChange(field.key, e.target.value)}
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
              onChange={(val) => onPropertyChange(field.key, val)}
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
              onChange={(e) => onPropertyChange(field.key, e.target.checked)}
              disabled={readOnly}
            />
          </SettingRow>
        )
    }
  }

  return (
    <div className="widget-setting-demo">
      <SettingSection title="Map Source">
        <SettingRow flow={FlowType.Wrap}>
          <Label style={{ width: '100%', marginBottom: '4px' }}>Use Existing Map Widget</Label>
          <Switch
            checked={config?.useExistingMap ?? true}
            onChange={(e) => onPropertyChange('useExistingMap', e.target.checked)}
          />
        </SettingRow>

        {config?.useExistingMap ? (
          <SettingRow flow={FlowType.Wrap}>
            <Label style={{ width: '100%', marginBottom: '4px' }}>Select Map Widget</Label>
            <MapWidgetSelector useMapWidgetIds={props.useMapWidgetIds} onSelect={onMapWidgetSelected} />
          </SettingRow>
        ) : null}
        
        {urlModeFields.map((field) => renderField(field, config?.useExistingMap ?? true))}
        
        <SourceConfigList
          sourceConfigs={config?.sourceConfigs || []}
          onChange={onSourceConfigsChange}
          readOnly={config?.useExistingMap ?? true}
        />
      </SettingSection>

      <SettingSection title="Configuration">
        {alwaysPresentFields.map((field) => renderField(field, false))}
      </SettingSection>
    </div>
  )
}

export default Setting