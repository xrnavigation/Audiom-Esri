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
  const [mapLatitude, setMapLatitude] = useState<number | undefined>(undefined)
  const [mapLongitude, setMapLongitude] = useState<number | undefined>(undefined)
  const [mapZoom, setMapZoom] = useState<number | undefined>(undefined)

  // Callback to apply synced config from MapSyncManager
  const applyConfigFromMap = useCallback((newMapConfig: MapSyncConfig) => {
    const currentSources = config.sourceConfigs || []
    const mapSources = newMapConfig.sourceConfigs || []
    
    // Merge sources, preserving enabled/locked state for manually unlocked items
    const mergedSources = mergeSourcesPreservingUnlocked(currentSources, mapSources)
    
    const currentSourcesJson = JSON.stringify(currentSources)
    const mergedSourcesJson = JSON.stringify(mergedSources)
    
    // Track the map values for display/sync purposes
    setMapTitle(newMapConfig.title)
    setMapLatitude(newMapConfig.centerLatitude)
    setMapLongitude(newMapConfig.centerLongitude)
    setMapZoom(newMapConfig.zoom)
    
    // Check which fields need to be updated (only if locked)
    const titleLocked = config.titleLocked ?? DEFAULT_CONFIG.titleLocked
    const latLocked = config.centerLatitudeLocked ?? DEFAULT_CONFIG.centerLatitudeLocked
    const lngLocked = config.centerLongitudeLocked ?? DEFAULT_CONFIG.centerLongitudeLocked
    const zoomLocked = config.zoomLocked ?? DEFAULT_CONFIG.zoomLocked
    
    const titleNeedsUpdate = titleLocked && config.title !== newMapConfig.title
    const latNeedsUpdate = latLocked && config.centerLatitude !== newMapConfig.centerLatitude
    const lngNeedsUpdate = lngLocked && config.centerLongitude !== newMapConfig.centerLongitude
    const zoomNeedsUpdate = zoomLocked && config.zoom !== newMapConfig.zoom
    
    const needsUpdate = 
      latNeedsUpdate ||
      lngNeedsUpdate ||
      zoomNeedsUpdate ||
      currentSourcesJson !== mergedSourcesJson ||
      titleNeedsUpdate

    if (needsUpdate) {
      let newConfig = config.set(AudiomConfigKey.SourceConfigs, mergedSources)
      
      // Only sync each field if locked
      if (latLocked && newMapConfig.centerLatitude !== undefined) {
        newConfig = newConfig.set(AudiomConfigKey.CenterLatitude, newMapConfig.centerLatitude)
      }
      if (lngLocked && newMapConfig.centerLongitude !== undefined) {
        newConfig = newConfig.set(AudiomConfigKey.CenterLongitude, newMapConfig.centerLongitude)
      }
      if (zoomLocked && newMapConfig.zoom !== undefined) {
        newConfig = newConfig.set(AudiomConfigKey.Zoom, newMapConfig.zoom)
      }
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

  // Handle latitude lock/unlock toggle
  const onLatitudeLockToggle = () => {
    const currentLocked = config?.centerLatitudeLocked ?? DEFAULT_CONFIG.centerLatitudeLocked
    let newConfig = config.set(AudiomConfigKey.CenterLatitudeLocked, !currentLocked)
    
    // If relocking, reset to map value
    if (!currentLocked && mapLatitude !== undefined) {
      newConfig = newConfig.set(AudiomConfigKey.CenterLatitude, mapLatitude)
    }
    
    props.onSettingChange({
      id: props.id,
      config: newConfig
    })
  }

  // Handle longitude lock/unlock toggle
  const onLongitudeLockToggle = () => {
    const currentLocked = config?.centerLongitudeLocked ?? DEFAULT_CONFIG.centerLongitudeLocked
    let newConfig = config.set(AudiomConfigKey.CenterLongitudeLocked, !currentLocked)
    
    // If relocking, reset to map value
    if (!currentLocked && mapLongitude !== undefined) {
      newConfig = newConfig.set(AudiomConfigKey.CenterLongitude, mapLongitude)
    }
    
    props.onSettingChange({
      id: props.id,
      config: newConfig
    })
  }

  // Handle zoom lock/unlock toggle
  const onZoomLockToggle = () => {
    const currentLocked = config?.zoomLocked ?? DEFAULT_CONFIG.zoomLocked
    let newConfig = config.set(AudiomConfigKey.ZoomLocked, !currentLocked)
    
    // If relocking, reset to map value
    if (!currentLocked && mapZoom !== undefined) {
      newConfig = newConfig.set(AudiomConfigKey.Zoom, mapZoom)
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

  // Render map settings fields with lock/unlock buttons when synced to a map
  const renderMapSettingsFields = () => {
    const useExistingMap = config?.useExistingMap ?? DEFAULT_CONFIG.useExistingMap
    const latLocked = config?.centerLatitudeLocked ?? DEFAULT_CONFIG.centerLatitudeLocked
    const lngLocked = config?.centerLongitudeLocked ?? DEFAULT_CONFIG.centerLongitudeLocked
    const zoomLocked = config?.zoomLocked ?? DEFAULT_CONFIG.zoomLocked
    
    const currentLat = config?.centerLatitude ?? DEFAULT_CONFIG.centerLatitude
    const currentLng = config?.centerLongitude ?? DEFAULT_CONFIG.centerLongitude
    const currentZoom = config?.zoom ?? DEFAULT_CONFIG.zoom

    // Helper to render a lockable numeric field
    const renderLockableNumericField = (
      label: string,
      value: number,
      locked: boolean,
      onLockToggle: () => void,
      onChange: (val: number) => void,
      configKey: AudiomConfigKey,
      min?: number,
      max?: number
    ) => {
      // If not synced to a map, render as a regular input (always editable)
      if (!useExistingMap) {
        return (
          <SettingRow flow={FlowType.Wrap} key={configKey}>
            <CopyableLabel label={label} copyValue={String(value)} />
            <NumericInput
              style={{ width: '100%' }}
              value={value}
              onChange={onChange}
              min={min}
              max={max}
              aria-label={label}
            />
          </SettingRow>
        )
      }

      // If synced to a map, show lock/unlock button
      return (
        <SettingRow flow={FlowType.Wrap} key={configKey}>
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', marginBottom: 4 }}>
            <Label style={{ flex: 1, marginBottom: 0 }}>{label}</Label>
            <Tooltip title={locked ? `Unlock to edit ${label.toLowerCase()} manually` : `Lock to sync with map`}>
              <Button
                type="tertiary"
                size="sm"
                onClick={onLockToggle}
                aria-label={locked ? `Unlock ${label.toLowerCase()}` : `Lock ${label.toLowerCase()}`}
                style={{ padding: '2px', minWidth: 'auto', background: 'transparent', border: 'none' }}
              >
                {locked ? <LockOutlined size={12} /> : <UnlockOutlined size={12} />}
              </Button>
            </Tooltip>
            <CopyableLabel label="" copyValue={String(value)} style={{ width: 'auto', marginBottom: 0 }} />
          </div>
          <NumericInput
            style={{ width: '100%' }}
            value={value}
            onChange={onChange}
            min={min}
            max={max}
            disabled={locked}
            aria-label={label}
          />
        </SettingRow>
      )
    }

    return (
      <>
        {renderLockableNumericField(
          'Center Latitude',
          currentLat,
          latLocked,
          onLatitudeLockToggle,
          (val) => onPropertyChange(AudiomConfigKey.CenterLatitude, val),
          AudiomConfigKey.CenterLatitude,
          VALIDATION.LATITUDE_MIN,
          VALIDATION.LATITUDE_MAX
        )}
        {renderLockableNumericField(
          'Center Longitude',
          currentLng,
          lngLocked,
          onLongitudeLockToggle,
          (val) => onPropertyChange(AudiomConfigKey.CenterLongitude, val),
          AudiomConfigKey.CenterLongitude,
          VALIDATION.LONGITUDE_MIN,
          VALIDATION.LONGITUDE_MAX
        )}
        {renderLockableNumericField(
          'Zoom Level',
          currentZoom,
          zoomLocked,
          onZoomLockToggle,
          (val) => onPropertyChange(AudiomConfigKey.Zoom, val),
          AudiomConfigKey.Zoom,
          VALIDATION.ZOOM_MIN,
          VALIDATION.ZOOM_MAX
        )}
      </>
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
            {renderMapSettingsFields()}
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