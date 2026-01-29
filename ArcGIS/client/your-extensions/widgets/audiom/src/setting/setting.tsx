import { React } from 'jimu-core'
import type { AllWidgetSettingProps } from 'jimu-for-builder'
import { MapWidgetSelector, SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components'
import { NumericInput, Switch, Label, Button, ButtonGroup, Collapse, Tooltip, TextInput } from 'jimu-ui'
import { LockOutlined } from 'jimu-icons/outlined/editor/lock'
import { UnlockOutlined } from 'jimu-icons/outlined/editor/unlock'
import { StepSizeUnit } from '../../../../shared/audiom-client/StepSize'

import SourceConfigList from './components/SourceConfigList'
import CopyableLabel from './components/CopyableLabel'
import CollapsibleHeader from './components/CollapsibleHeader'
import FieldRenderer from './components/FieldRenderer'
import { audiomConfigToEmbedConfig, isAudiomConfigValid } from '../utils/maputils'
import { getMapSyncManager, MapSyncConfig } from '../utils/mapSyncManager'
import { mergeSourcesPreservingUnlocked } from '../utils/sourceConfigUtils'
import { createLogger } from '../utils/logger'
import { DEFAULT_CONFIG, FieldConfig, IAudiomConfig, ISourceConfig } from './configs'
import { ButtonType, FieldType, FlowType, Colors } from './enums'
import { Padding } from './paddings'
import { AudiomConfigKey } from './configKeys'
import { validateLatitude, validateLongitude, validateZoom, validateUrl, VALIDATION } from './validation/validation'

const { useEffect, useCallback, useState } = React

const logger = createLogger('Setting')

const Setting = (props: AllWidgetSettingProps<IAudiomConfig>) => {
  const { config } = props
  const mapSyncManager = getMapSyncManager()
  const [mapSettingsOpen, setMapSettingsOpen] = useState(true)
  const [mapTitle, setMapTitle] = useState<string | undefined>(undefined)

  // Callback to apply synced config from MapSyncManager
  const applyConfigFromMap = useCallback((newMapConfig: MapSyncConfig) => {
    const currentSources = config.sourceConfigs || []
    const mapSources = newMapConfig.sourceConfigs || []
    
    // Merge sources, preserving enabled/locked state for manually unlocked items
    const mergedSources = mergeSourcesPreservingUnlocked(currentSources, mapSources)
    
    const currentSourcesJson = JSON.stringify(currentSources)
    const mergedSourcesJson = JSON.stringify(mergedSources)
    
    // Track the map title for display/sync purposes
    setMapTitle(newMapConfig.title)
    
    // Check if title needs to be updated (only if locked)
    const titleLocked = config.titleLocked ?? DEFAULT_CONFIG.titleLocked
    const titleNeedsUpdate = titleLocked && config.title !== newMapConfig.title
    
    const needsUpdate = 
      config.centerLatitude !== newMapConfig.centerLatitude ||
      config.centerLongitude !== newMapConfig.centerLongitude ||
      config.zoom !== newMapConfig.zoom ||
      currentSourcesJson !== mergedSourcesJson ||
      titleNeedsUpdate

    if (needsUpdate) {
      let newConfig = config
        .set(AudiomConfigKey.CenterLatitude, newMapConfig.centerLatitude)
        .set(AudiomConfigKey.CenterLongitude, newMapConfig.centerLongitude)
        .set(AudiomConfigKey.Zoom, newMapConfig.zoom)
        .set(AudiomConfigKey.SourceConfigs, mergedSources)
      
      // Only sync title if locked
      if (titleLocked && newMapConfig.title !== undefined) {
        newConfig = newConfig.set(AudiomConfigKey.Title, newMapConfig.title)
      }

      logger.debug('Auto-sync settings: Updated config with', mergedSources.length, 'sources')

      props.onSettingChange({
        id: props.id,
        config: newConfig
      })
    }
  }, [config, props])

  // Get the effective map ID - prefer useMapWidgetIds from props, fall back to config
  const effectiveMapId = props.useMapWidgetIds?.[0] || config?.existingMapId || ''

  // Auto-sync existingMapId from props.useMapWidgetIds when it changes
  // This handles the case when the widget is first added and useMapWidgetIds gets populated
  useEffect(() => {
    const mapIdFromProps = props.useMapWidgetIds?.[0]
    if (mapIdFromProps && config?.existingMapId !== mapIdFromProps) {
      logger.debug('Auto-syncing existingMapId from useMapWidgetIds:', mapIdFromProps)
      props.onSettingChange({
        id: props.id,
        config: config.set(AudiomConfigKey.ExistingMapId, mapIdFromProps)
      })
    }
  }, [props.useMapWidgetIds, config?.existingMapId, props, config])

  // Initialize MapSyncManager and listen for changes
  useEffect(() => {
    // Use default value when useExistingMap is undefined
    const useExistingMap = config?.useExistingMap ?? DEFAULT_CONFIG.useExistingMap
    
    if (!useExistingMap || !effectiveMapId) {
      mapSyncManager.detach()
      return
    }

    let retryInterval: ReturnType<typeof setInterval> | null = null
    let isCleanedUp = false

    const tryAttachAndSync = () => {
      // Attach to the map and pass current config to detect initial mismatches
      const attached = mapSyncManager.attach(effectiveMapId, config)
      if (!attached) {
        return false
      }

      // Do initial sync
      const initialConfig = mapSyncManager.getCurrentConfig(effectiveMapId)
      if (initialConfig) {
        applyConfigFromMap(initialConfig)
      }

      // Listen for changes
      mapSyncManager.addChangeListener(applyConfigFromMap)
      return true
    }

    // Try to attach immediately
    const attachedImmediately = tryAttachAndSync()

    // If not attached, retry every 500ms until successful or cleaned up
    if (!attachedImmediately) {
      retryInterval = setInterval(() => {
        if (isCleanedUp) {
          if (retryInterval) clearInterval(retryInterval)
          return
        }
        const attached = tryAttachAndSync()
        if (attached && retryInterval) {
          clearInterval(retryInterval)
        }
      }, 500)
    }

    // Cleanup
    return () => {
      isCleanedUp = true
      if (retryInterval) clearInterval(retryInterval)
      mapSyncManager.removeChangeListener(applyConfigFromMap)
    }
  }, [config?.useExistingMap, effectiveMapId, applyConfigFromMap, mapSyncManager, config])

  const onMapWidgetSelected = (useMapWidgetIds: string[]) => {
    props.onSettingChange({
      id: props.id,
      useMapWidgetIds: useMapWidgetIds,
      config: config.set(AudiomConfigKey.ExistingMapId, useMapWidgetIds[0] || '')
    })
  }

  const onPropertyChange = (property: keyof IAudiomConfig, value: unknown) => {
    props.onSettingChange({
      id: props.id,
      config: config.set(property, value as IAudiomConfig[typeof property])
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
          aria-label="Step Size Value"
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

  // Handle title lock/unlock toggle
  const onTitleLockToggle = () => {
    const currentLocked = config?.titleLocked ?? DEFAULT_CONFIG.titleLocked
    let newConfig = config.set(AudiomConfigKey.TitleLocked, !currentLocked)
    
    // If relocking, reset title to map title
    if (!currentLocked && mapTitle !== undefined) {
      newConfig = newConfig.set(AudiomConfigKey.Title, mapTitle)
    }
    
    props.onSettingChange({
      id: props.id,
      config: newConfig
    })
  }

  // Render the custom title field with lock/unlock button when synced to a map
  const renderTitleField = () => {
    const useExistingMap = config?.useExistingMap ?? DEFAULT_CONFIG.useExistingMap
    const titleLocked = config?.titleLocked ?? DEFAULT_CONFIG.titleLocked
    const currentTitle = config?.title ?? ''
    
    // If not synced to a map, render as a regular text input
    if (!useExistingMap) {
      return (
        <SettingRow flow={FlowType.Wrap}>
          <CopyableLabel label="Title" copyValue={currentTitle} />
          <TextInput
            style={{ width: '100%' }}
            value={currentTitle}
            onChange={(e) => onPropertyChange(AudiomConfigKey.Title, e.target.value)}
            placeholder="Enter widget title"
            aria-label="Title"
          />
        </SettingRow>
      )
    }
    
    // If synced to a map, show lock/unlock button next to the copy icon in the label row
    return (
      <SettingRow flow={FlowType.Wrap}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', marginBottom: 4 }}>
          <Label style={{ flex: 1, marginBottom: 0 }}>Title</Label>
          <Tooltip title={titleLocked ? 'Unlock to edit title manually' : 'Lock to sync with map title'}>
            <Button
              type="tertiary"
              size="sm"
              onClick={onTitleLockToggle}
              aria-label={titleLocked ? 'Unlock title' : 'Lock title'}
              style={{ padding: '2px', minWidth: 'auto', background: 'transparent', border: 'none' }}
            >
              {titleLocked ? <LockOutlined size={12} /> : <UnlockOutlined size={12} />}
            </Button>
          </Tooltip>
          <CopyableLabel label="" copyValue={currentTitle} style={{ width: 'auto', marginBottom: 0 }} />
        </div>
        <TextInput
          style={{ width: '100%' }}
          value={currentTitle}
          onChange={(e) => onPropertyChange(AudiomConfigKey.Title, e.target.value)}
          placeholder="Enter widget title"
          disabled={titleLocked}
          aria-label="Title"
        />
      </SettingRow>
    )
  }

  // Connection fields - set once
  const connectionFields: FieldConfig[] = [
    { key: AudiomConfigKey.ApiKey, label: 'API Key', type: FieldType.Password, placeholder: 'Enter API key' },
    { key: AudiomConfigKey.BaseUrl, label: 'Audiom Server Base URL', type: FieldType.Text, placeholder: 'Enter Audiom server URL', defaultValue: DEFAULT_CONFIG.baseUrl, validateOnAccept: (val) => validateUrl(String(val)) },
    { key: AudiomConfigKey.SoundpackUrl, label: 'Soundpack URL', type: FieldType.Text, placeholder: 'Enter soundpack URL', validateOnAccept: (val) => validateUrl(String(val)) }
  ]

  // Display fields - appearance & behavior (Title is rendered separately with lock/unlock)
  const displayFields: FieldConfig[] = [
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
    const labelSuffix = field.key === AudiomConfigKey.StepSize ? getStepSizeDisplayText() : undefined

    return (
      <FieldRenderer
        key={field.key}
        field={field}
        value={value}
        onChange={onPropertyChange}
        disabled={readOnly}
        labelSuffix={labelSuffix}
      />
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
        {renderTitleField()}
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