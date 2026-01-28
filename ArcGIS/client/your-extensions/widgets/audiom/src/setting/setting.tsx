import { React } from 'jimu-core'
import type { AllWidgetSettingProps } from 'jimu-for-builder'
import { MapWidgetSelector, SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components'
import { TextInput, NumericInput, Switch, Label, Button, ButtonGroup, Collapse, Tooltip } from 'jimu-ui'
import { StepSizeUnit } from '../../../../shared/audiom-client/StepSize'

import SourceConfigList from './components/SourceConfigList'
import CopyableLabel from './components/CopyableLabel'
import CollapsibleHeader from './components/CollapsibleHeader'
import { audiomConfigToEmbedConfig, isAudiomConfigValid } from '../utils/maputils'
import { getMapSyncManager, MapSyncConfig } from '../utils/mapSyncManager'
import { mergeSourcesPreservingUnlocked } from '../utils/sourceConfigUtils'
import { DEFAULT_CONFIG, FieldConfig, IAudiomConfig, ISourceConfig } from './configs'
import { ButtonType, FieldType, FlowType, Colors } from './enums'
import { Padding } from './paddings'
import { AudiomConfigKey } from './configKeys'
import { validateLatitude, validateLongitude, validateZoom, validateUrl, VALIDATION } from './validation/validation'

const { useEffect, useCallback, useState } = React

const Setting = (props: AllWidgetSettingProps<IAudiomConfig>) => {
  const { config } = props
  const mapSyncManager = getMapSyncManager()
  const [mapSettingsOpen, setMapSettingsOpen] = useState(true)

  // Callback to apply synced config from MapSyncManager
  const applyConfigFromMap = useCallback((newMapConfig: MapSyncConfig) => {
    const currentSources = config.sourceConfigs || []
    const mapSources = newMapConfig.sourceConfigs || []
    
    // Merge sources, preserving enabled/locked state for manually unlocked items
    const mergedSources = mergeSourcesPreservingUnlocked(currentSources, mapSources)
    
    const currentSourcesJson = JSON.stringify(currentSources)
    const mergedSourcesJson = JSON.stringify(mergedSources)
    
    const needsUpdate = 
      config.centerLatitude !== newMapConfig.centerLatitude ||
      config.centerLongitude !== newMapConfig.centerLongitude ||
      config.zoom !== newMapConfig.zoom ||
      currentSourcesJson !== mergedSourcesJson

    if (needsUpdate) {
      let newConfig = config
        .set(AudiomConfigKey.CenterLatitude, newMapConfig.centerLatitude)
        .set(AudiomConfigKey.CenterLongitude, newMapConfig.centerLongitude)
        .set(AudiomConfigKey.Zoom, newMapConfig.zoom)
        .set(AudiomConfigKey.SourceConfigs, mergedSources)

      console.log('Auto-sync settings: Updated config with', mergedSources.length, 'sources')

      props.onSettingChange({
        id: props.id,
        config: newConfig
      })
    }
  }, [config, props])

  // Initialize MapSyncManager and listen for changes
  useEffect(() => {
    if (!config?.useExistingMap || !config?.existingMapId) {
      mapSyncManager.detach()
      return
    }

    // Attach to the map and pass current config to detect initial mismatches
    const attached = mapSyncManager.attach(config.existingMapId, config)
    if (!attached) {
      return
    }

    // Do initial sync
    const initialConfig = mapSyncManager.getCurrentConfig(config.existingMapId)
    if (initialConfig) {
      applyConfigFromMap(initialConfig)
    }

    // Listen for changes
    mapSyncManager.addChangeListener(applyConfigFromMap)

    // Cleanup
    return () => {
      mapSyncManager.removeChangeListener(applyConfigFromMap)
    }
  }, [config?.useExistingMap, config?.existingMapId, applyConfigFromMap, mapSyncManager])

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

  const renderStepSizeUnitSelector = () => {
    const currentUnit = config?.stepSizeUnit ?? DEFAULT_CONFIG.stepSizeUnit
    const currentStepSize = config?.stepSize ?? DEFAULT_CONFIG.stepSize
    const stepSizeUnits = [
      { value: StepSizeUnit.Meters, label: StepSizeUnit.Meters, tooltip: 'Meters' },
      { value: StepSizeUnit.Kilometers, label: StepSizeUnit.Kilometers, tooltip: 'Kilometers' },
      { value: StepSizeUnit.Feet, label: StepSizeUnit.Feet, tooltip: 'Feet' },
      { value: StepSizeUnit.Miles, label: StepSizeUnit.Miles, tooltip: 'Miles' }
    ]
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center', width: '100%' }}>
        <NumericInput
          style={{ width: '100%' }}
          value={currentStepSize}
          onChange={(val) => onPropertyChange(AudiomConfigKey.StepSize, val)}
          min={0.1}
        />
        <ButtonGroup>
          {stepSizeUnits.map((unit) => (
            <Tooltip key={unit.value} title={unit.tooltip}>
              <Button
                active={currentUnit === unit.value}
                onClick={() => onPropertyChange(AudiomConfigKey.StepSizeUnit, unit.value)}
                style={{ minWidth: '36px' }}
              >
                {unit.label}
              </Button>
            </Tooltip>
          ))}
        </ButtonGroup>
      </div>
    )
  }

  // Get current step size display text for the header
  const getStepSizeDisplayText = () => {
    const currentUnit = config?.stepSizeUnit ?? DEFAULT_CONFIG.stepSizeUnit
    const currentStepSize = config?.stepSize ?? DEFAULT_CONFIG.stepSize
    return `${currentStepSize} ${currentUnit}`
  }

  // Connection fields - set once
  const connectionFields: FieldConfig[] = [
    { key: AudiomConfigKey.ApiKey, label: 'API Key', type: FieldType.Text, placeholder: 'Enter API key' },
    { key: AudiomConfigKey.BaseUrl, label: 'Audiom Server Base URL', type: FieldType.Text, placeholder: 'Enter Audiom server URL', defaultValue: DEFAULT_CONFIG.baseUrl, validateOnAccept: (val) => validateUrl(String(val)) },
    { key: AudiomConfigKey.SoundpackUrl, label: 'Soundpack URL', type: FieldType.Text, placeholder: 'Enter soundpack URL', validateOnAccept: (val) => validateUrl(String(val)) }
  ]

  // Display fields - appearance & behavior
  const displayFields: FieldConfig[] = [
    { key: AudiomConfigKey.Title, label: 'Title', type: FieldType.Text, placeholder: 'Enter widget title' },
    { key: AudiomConfigKey.StepSize, label: 'Step Size', type: FieldType.Custom, showCopyButton: false, renderCustom: renderStepSizeUnitSelector },
    { key: AudiomConfigKey.ShowVisualMap, label: 'Show Visual Map', type: FieldType.Switch, defaultValue: DEFAULT_CONFIG.showVisualMap, showCopyButton: false },
    { key: AudiomConfigKey.ShowHeading, label: 'Show Heading', type: FieldType.Switch, defaultValue: DEFAULT_CONFIG.showHeading, showCopyButton: false },
    { key: AudiomConfigKey.Heading, label: 'Heading Size', type: FieldType.Number, min: 0, max: 360, defaultValue: DEFAULT_CONFIG.heading, showCopyButton: false }
  ]

  const urlModeFields: FieldConfig[] = [
    { key: AudiomConfigKey.CenterLatitude, label: 'Center Latitude', type: FieldType.Number, defaultValue: DEFAULT_CONFIG.centerLatitude, min: VALIDATION.LATITUDE_MIN, max: VALIDATION.LATITUDE_MAX, validateOnAccept: (val) => validateLatitude(Number(val)) },
    { key: AudiomConfigKey.CenterLongitude, label: 'Center Longitude', type: FieldType.Number, defaultValue: DEFAULT_CONFIG.centerLongitude, min: VALIDATION.LONGITUDE_MIN, max: VALIDATION.LONGITUDE_MAX, validateOnAccept: (val) => validateLongitude(Number(val)) },
    { key: AudiomConfigKey.Zoom, label: 'Zoom Level', type: FieldType.Number, min: VALIDATION.ZOOM_MIN, max: VALIDATION.ZOOM_MAX, defaultValue: DEFAULT_CONFIG.zoom, validateOnAccept: (val) => validateZoom(Number(val)) }
  ]

  const renderField = (field: FieldConfig, readOnly: boolean = false) => {
    const value = config?.[field.key] ?? field.defaultValue

    const renderFieldContent = () => {
      switch (field.type) {
        case FieldType.Text:
          return (
            <SettingRow key={field.key} flow={FlowType.Wrap}>
              <CopyableLabel label={field.label} copyValue={String(value || '')} showCopyButton={field.showCopyButton} />
              <TextInput
                style={{ width: '100%' }}
                value={value || ''}
                onChange={(e) => onPropertyChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                disabled={readOnly}
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
                onChange={(val) => {
                  // Validate on change and only update if valid (or let NumericInput handle min/max)
                  if (field.validateOnAccept) {
                    const result = field.validateOnAccept(val)
                    if (!result.valid) {
                      console.warn(`Validation failed for ${field.key}:`, result.msg)
                    }
                  }
                  onPropertyChange(field.key, val)
                }}
                min={field.min}
                max={field.max}
                disabled={readOnly}
              />
            </SettingRow>
          )
        case FieldType.Switch:
          return (
            <SettingRow key={field.key} flow={FlowType.Wrap}>
              <CopyableLabel label={field.label} copyValue={String(value)} showCopyButton={field.showCopyButton} />
              <Switch
                checked={value}
                onChange={(e) => onPropertyChange(field.key, e.target.checked)}
                disabled={readOnly}
              />
            </SettingRow>
          )
        case FieldType.Custom:
          return (
            <SettingRow key={field.key} flow={FlowType.Wrap}>
              <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                <CopyableLabel label={field.label} copyValue={''} showCopyButton={false} />
                {field.key === AudiomConfigKey.StepSize && (
                  <Label style={{ color: Colors.TextMuted, fontSize: '12px', whiteSpace: 'nowrap', marginLeft: '8px', flex: '1', textAlign: 'right' }}>{getStepSizeDisplayText()}</Label>
                )}
              </div>
              {field.renderCustom?.()}
            </SettingRow>
          )
      }
    }

    return (
      <React.Fragment key={field.key}>
        {renderFieldContent()}
        {field.renderAfter?.()}
      </React.Fragment>
    )
  }

  return (
    <div className="widget-setting-demo">
      <SettingSection title="Connection">
        {connectionFields.map((field) => renderField(field, false))}
      </SettingSection>

      <SettingSection title="Map Configuration">
        <SettingRow flow={FlowType.Wrap}>
          <CopyableLabel label="Use Existing Map Widget" copyValue={String(config?.useExistingMap ?? DEFAULT_CONFIG.useExistingMap)} showCopyButton={false} />
          <Switch
            checked={config?.useExistingMap ?? DEFAULT_CONFIG.useExistingMap}
            onChange={(e) => onPropertyChange('useExistingMap', e.target.checked)}
          />
        </SettingRow>

        {(config?.useExistingMap ?? DEFAULT_CONFIG.useExistingMap) ? (
          <SettingRow flow={FlowType.Wrap}>
            <CopyableLabel label="Select Map Widget" copyValue={config?.existingMapId || ''} showCopyButton={false} />
            <MapWidgetSelector useMapWidgetIds={props.useMapWidgetIds} onSelect={onMapWidgetSelected} />
          </SettingRow>
        ) : null}

        <CollapsibleHeader
          label="Map Settings"
          isOpen={mapSettingsOpen}
          onToggle={() => setMapSettingsOpen(!mapSettingsOpen)}
        />
        <Collapse isOpen={mapSettingsOpen}>
          <div style={{ paddingLeft: Padding.SectionContent }}>
            {urlModeFields.map((field) => renderField(field, config?.useExistingMap ?? DEFAULT_CONFIG.useExistingMap))}
          </div>
        </Collapse>

        <SourceConfigList
          sourceConfigs={config?.sourceConfigs || []}
          onChange={onSourceConfigsChange}
          readOnly={config?.useExistingMap ?? DEFAULT_CONFIG.useExistingMap}
        />
      </SettingSection>

      <SettingSection title="Display">
        {displayFields.map((field) => {
          // Only show Heading Size if Show Heading is true
          if (field.key === AudiomConfigKey.Heading) {
            const showHeading = config?.showHeading ?? DEFAULT_CONFIG.showHeading
            if (!showHeading) return null
          }
          return renderField(field, false)
        })}
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
          <Label style={{ width: '100%', color: Colors.TextMuted, fontSize: '12px' }}>
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