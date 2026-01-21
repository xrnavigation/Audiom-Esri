import { React } from 'jimu-core'
import type { AllWidgetSettingProps } from 'jimu-for-builder'
import { MapWidgetSelector, SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components'
import { TextInput, NumericInput, Switch, Label, Button } from 'jimu-ui'

import SourceConfigList from './SourceConfigList'
import { MapViewManager } from 'jimu-arcgis'
import { extractMapConfigFromEsriMap, audiomConfigToEmbedConfig, isAudiomConfigValid } from '../utils/maputils'
import { DEFAULT_CONFIG, FieldConfig, IAudiomConfig, ISourceConfig } from './configs'
import { ButtonType, FieldType, FlowType } from './enums'
import { AudiomConfigKey } from './configKeys'

const { useEffect } = React

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
            .set(AudiomConfigKey.CenterLatitude, extractedConfig.centerLatitude)
            .set(AudiomConfigKey.CenterLongitude, extractedConfig.centerLongitude)
            .set(AudiomConfigKey.Zoom, extractedConfig.zoom)

          // Update source configs if available
          if (extractedConfig.sourceConfigs) {
            newConfig = newConfig.set(AudiomConfigKey.SourceConfigs, extractedConfig.sourceConfigs)
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
      config: config.set(AudiomConfigKey.ExistingMapId, useMapWidgetIds[0] || '')
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
      config: config.set(AudiomConfigKey.SourceConfigs, sourceConfigs)
    })
  }

  const onPreviewInAudiom = () => {
    // For preview, we use URL mode sources (not existing map sources since we don't have JimuMapView in settings)
    const plainConfig: IAudiomConfig = { ...config, useExistingMap: false }
    const embedConfig = audiomConfigToEmbedConfig(plainConfig, undefined)

    const previewUrl = embedConfig.toUrl(plainConfig.baseUrl || DEFAULT_CONFIG.baseUrl)
    window.open(previewUrl, '_blank')
  }

  const alwaysPresentFields: FieldConfig[] = [
    { key: AudiomConfigKey.Title, label: 'Title', type: FieldType.Text, placeholder: 'Enter widget title' },
    { key: AudiomConfigKey.ApiKey, label: 'API Key', type: FieldType.Text, placeholder: 'Enter API key' },
    { key: AudiomConfigKey.BaseUrl, label: 'Audiom Server Base URL', type: FieldType.Text, placeholder: 'Enter Audiom server URL', defaultValue: DEFAULT_CONFIG.baseUrl },
    { key: AudiomConfigKey.StepSize, label: 'Step Size', type: FieldType.Number, min: 0.1, defaultValue: DEFAULT_CONFIG.stepSize },
    { key: AudiomConfigKey.ShowVisualMap, label: 'Show Visual Map', type: FieldType.Switch, defaultValue: DEFAULT_CONFIG.showVisualMap },
    { key: AudiomConfigKey.ShowHeading, label: 'Show Heading', type: FieldType.Switch, defaultValue: DEFAULT_CONFIG.showHeading },
    { key: AudiomConfigKey.Heading, label: 'Heading', type: FieldType.Number, min: 0, max: 360, defaultValue: DEFAULT_CONFIG.heading },
    { key: AudiomConfigKey.SoundpackUrl, label: 'Soundpack URL', type: FieldType.Text, placeholder: 'Enter soundpack URL' }
  ]

  const urlModeFields: FieldConfig[] = [
    { key: AudiomConfigKey.CenterLatitude, label: 'Center Latitude', type: FieldType.Number, defaultValue: DEFAULT_CONFIG.centerLatitude },
    { key: AudiomConfigKey.CenterLongitude, label: 'Center Longitude', type: FieldType.Number, defaultValue: DEFAULT_CONFIG.centerLongitude },
    { key: AudiomConfigKey.Zoom, label: 'Zoom Level', type: FieldType.Number, min: 0, max: 20, defaultValue: DEFAULT_CONFIG.zoom }
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
            checked={config?.useExistingMap ?? DEFAULT_CONFIG.useExistingMap}
            onChange={(e) => onPropertyChange('useExistingMap', e.target.checked)}
          />
        </SettingRow>

        {(config?.useExistingMap ?? DEFAULT_CONFIG.useExistingMap) ? (
          <SettingRow flow={FlowType.Wrap}>
            <Label style={{ width: '100%', marginBottom: '4px' }}>Select Map Widget</Label>
            <MapWidgetSelector useMapWidgetIds={props.useMapWidgetIds} onSelect={onMapWidgetSelected} />
          </SettingRow>
        ) : null}

        {urlModeFields.map((field) => renderField(field, config?.useExistingMap ?? DEFAULT_CONFIG.useExistingMap))}

        <SourceConfigList
          sourceConfigs={config?.sourceConfigs || []}
          onChange={onSourceConfigsChange}
          readOnly={config?.useExistingMap ?? DEFAULT_CONFIG.useExistingMap}
        />
      </SettingSection>

      <SettingSection title="Configuration">
        {alwaysPresentFields.map((field) => renderField(field, false))}
        <SettingRow flow={FlowType.Wrap}>
          <Button
            type={ButtonType.Primary}
            style={{ width: '100%' }}
            onClick={onPreviewInAudiom}
            disabled={!isAudiomConfigValid(config)}
          >
            Preview in Audiom
          </Button>
        </SettingRow>
        <SettingRow flow={FlowType.Wrap}>
          <Label style={{ width: '100%', color: '#6b7280', fontSize: '12px' }}>
            {(!isAudiomConfigValid(config))
              ? 'API Key is required to preview in Audiom.'
              : 'Opens the current configuration in a new tab.'}
          </Label>
        </SettingRow>
      </SettingSection>
    </div>
  )
}

export default Setting