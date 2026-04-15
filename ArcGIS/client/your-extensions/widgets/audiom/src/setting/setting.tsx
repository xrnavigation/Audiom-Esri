import { React } from 'jimu-core'
import type { AllWidgetSettingProps } from 'jimu-for-builder'
import { MapWidgetSelector, SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components'
import { NumericInput, Switch, Button, ButtonGroup, Collapse, Tooltip, Label } from 'jimu-ui'
import { StepSizeUnit } from '../../../../shared/audiom-client/StepSize'

import SourceConfigList from './components/SourceConfigList'
import CopyableLabel from './components/CopyableLabel'
import CollapsibleHeader from './components/CollapsibleHeader'
import FieldRenderer from './components/FieldRenderer'
import VisualBaseLayerList from './components/VisualBaseLayerList'
import { useMapSyncState } from './hooks/useMapSyncState'
import { audiomConfigToEmbedConfig, isAudiomConfigValid } from '../utils/mapUtils'
import { getMapSyncManager, MapSyncConfig, AUTO_SYNC_LAYERS } from '../utils/mapSyncManager'
import { mergeSourcesPreservingUnlocked } from '../utils/sourceConfigUtils'
import { createLogger } from '../utils/logger'
import { DEFAULT_CONFIG, FieldConfig, IAudiomConfig, ISourceConfig } from './configs'
import { ButtonType, FieldType, FlowType, Colors } from './enums'
import { Padding } from './paddings'
import { AudiomConfigKey, LockableFieldName } from './configKeys'
import { validateUrl, VALIDATION } from './validation/validation'

const { useEffect, useCallback, useState, useRef } = React

const logger = createLogger('Setting')

/** Retry interval in milliseconds for map attachment */
const RETRY_INTERVAL_MS = 500

const Setting = (props: AllWidgetSettingProps<IAudiomConfig>) => {
  const { config } = props
  const mapSyncManager = getMapSyncManager()
  const [mapSettingsOpen, setMapSettingsOpen] = useState(true)

  // Helper to update config
  const updateConfig = useCallback((newConfig: IAudiomConfig) => {
    props.onSettingChange({
      id: props.id,
      config: newConfig
    })
  }, [props])

  // Use the map sync state hook for lockable fields
  const {
    mapValues,
    updateMapValues,
    isFieldLocked,
    createLockToggleHandler,
    fieldNeedsUpdate,
    syncLockedFieldsToConfig
  } = useMapSyncState(config, updateConfig)

  // Callback to apply synced config from MapSyncManager
  const applyConfigFromMap = useCallback((newMapConfig: MapSyncConfig) => {
    const currentSources = config.sourceConfigs || []
    const mapSources = newMapConfig.sourceConfigs || []
    
    // Merge sources, preserving enabled/locked state for manually unlocked items
    const mergedSources = mergeSourcesPreservingUnlocked(currentSources, mapSources)
    
    const currentSourcesJson = JSON.stringify(currentSources)
    const mergedSourcesJson = JSON.stringify(mergedSources)
    
    // Track the map values for display/sync purposes
    updateMapValues(newMapConfig)
    
    // Check which fields need to be updated (only if locked)
    const needsUpdate = 
      fieldNeedsUpdate(LockableFieldName.CenterLatitude, newMapConfig.centerLatitude) ||
      fieldNeedsUpdate(LockableFieldName.CenterLongitude, newMapConfig.centerLongitude) ||
      fieldNeedsUpdate(LockableFieldName.Zoom, newMapConfig.zoom) ||
      fieldNeedsUpdate(LockableFieldName.Title, newMapConfig.title) ||
      currentSourcesJson !== mergedSourcesJson

    if (needsUpdate) {
      // Sync source configs
      let newConfig = config.set(AudiomConfigKey.SourceConfigs, mergedSources)
      
      // Sync all locked fields using the helper
      newConfig = syncLockedFieldsToConfig(newConfig, newMapConfig)

      logger.debug('Auto-sync settings: Updated config with', mergedSources.length, 'sources')

      updateConfig(newConfig)
    }
  }, [config, updateConfig, updateMapValues, fieldNeedsUpdate, syncLockedFieldsToConfig])

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

  // Initialize MapSyncManager: do the initial sync once when useExistingMap is
  // first enabled for a given map, but only subscribe to ongoing layer/zoom
  // changes when AUTO_SYNC_LAYERS is on.
  //
  // Initial sync tracking lives in the singleton MapSyncManager so it persists
  // across component remounts (ExB remounts settings when switching widgets).
  const applyConfigFromMapRef = useRef(applyConfigFromMap)
  applyConfigFromMapRef.current = applyConfigFromMap

  useEffect(() => {
    // Use default value when useExistingMap is undefined
    const useExistingMap = config?.useExistingMap ?? DEFAULT_CONFIG.useExistingMap
    
    if (!useExistingMap || !effectiveMapId) {
      mapSyncManager.detach()
      mapSyncManager.resetInitialSync()
      return
    }

    // If the singleton already did the initial sync for this map, only add change listener
    if (mapSyncManager.isInitialSyncDone(effectiveMapId)) {
      if (AUTO_SYNC_LAYERS) {
        mapSyncManager.addChangeListener(applyConfigFromMapRef.current)
      }
      return () => {
        mapSyncManager.removeChangeListener(applyConfigFromMapRef.current)
      }
    }

    let retryInterval: ReturnType<typeof setInterval> | null = null
    let isCleanedUp = false

    const tryAttachAndSync = () => {
      // Attach to the map and pass current config to detect initial mismatches
      const attached = mapSyncManager.attach(effectiveMapId, config)
      if (!attached) {
        return false
      }

      // Do initial sync (once per map ID, tracked in singleton)
      const initialConfig = mapSyncManager.getCurrentConfig(effectiveMapId)
      if (initialConfig) {
        applyConfigFromMapRef.current(initialConfig)
      }
      mapSyncManager.markInitialSyncDone(effectiveMapId)

      // Only listen for ongoing changes when auto-sync is enabled
      if (AUTO_SYNC_LAYERS) {
        mapSyncManager.addChangeListener(applyConfigFromMapRef.current)
      }
      return true
    }

    // Try to attach immediately
    const attachedImmediately = tryAttachAndSync()

    // If not attached, retry periodically until successful or cleaned up
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
      }, RETRY_INTERVAL_MS)
    }

    // Cleanup
    return () => {
      isCleanedUp = true
      if (retryInterval) clearInterval(retryInterval)
      mapSyncManager.removeChangeListener(applyConfigFromMapRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.useExistingMap, effectiveMapId, mapSyncManager])

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

  // Connection fields - set once
  const connectionFields: FieldConfig[] = [
    { key: AudiomConfigKey.ApiKey, label: 'API Key', type: FieldType.Password, placeholder: 'Enter API key' },
    { key: AudiomConfigKey.BaseUrl, label: 'Audiom Server Base URL', type: FieldType.Text, placeholder: 'Enter Audiom server URL', defaultValue: DEFAULT_CONFIG.baseUrl, validateOnAccept: (val) => validateUrl(String(val)) },
    { key: AudiomConfigKey.SoundpackUrl, label: 'Soundpack URL', type: FieldType.Text, placeholder: 'Enter soundpack name or URL' }
  ]

  // Map settings fields - lockable when using existing map
  const mapSettingsFields: FieldConfig[] = [
    {
      key: AudiomConfigKey.CenterLatitude, label: 'Center', type: FieldType.CoordinatePair,
      showCopyButton: true,
      coordinatePair: {
        lngKey: AudiomConfigKey.CenterLongitude,
        latLabel: 'Latitude', lngLabel: 'Longitude',
        latLockableFieldName: LockableFieldName.CenterLatitude,
        lngLockableFieldName: LockableFieldName.CenterLongitude
      }
    },
    { key: AudiomConfigKey.Zoom, label: 'Zoom Level', type: FieldType.Number, min: VALIDATION.ZOOM_MIN, max: VALIDATION.ZOOM_MAX, defaultValue: DEFAULT_CONFIG.zoom, lockable: true, lockableFieldName: LockableFieldName.Zoom }
  ]

  // Display fields - appearance & behavior
  const displayFields: FieldConfig[] = [
    { key: AudiomConfigKey.Title, label: 'Title', type: FieldType.Text, placeholder: 'Enter widget title', lockable: true, lockableFieldName: LockableFieldName.Title },
    { key: AudiomConfigKey.StepSize, label: 'Step Size', type: FieldType.Custom, showCopyButton: false, renderCustom: renderStepSizeUnitSelector },
    { key: AudiomConfigKey.ShowVisualMap, label: 'Show Visual Map', type: FieldType.Switch, defaultValue: DEFAULT_CONFIG.showVisualMap, showCopyButton: false },
    { key: AudiomConfigKey.ShowHeading, label: 'Show Heading', type: FieldType.Switch, defaultValue: DEFAULT_CONFIG.showHeading, showCopyButton: false },
    { key: AudiomConfigKey.Heading, label: 'Heading Size', type: FieldType.Number, min: 0, max: 360, defaultValue: DEFAULT_CONFIG.heading, showCopyButton: false },
    { key: AudiomConfigKey.VisualStyle, label: 'Visual Style', type: FieldType.Enum, enumOptions: [{ label: 'Default', value: '' }, { label: 'Geology', value: 'geology' }], showCopyButton: false }
  ]

  const useExistingMap = config?.useExistingMap ?? DEFAULT_CONFIG.useExistingMap

  const renderField = (field: FieldConfig, readOnly: boolean = false) => {
    const value = config?.[field.key] ?? field.defaultValue
    const labelSuffix = field.key === AudiomConfigKey.StepSize ? getStepSizeDisplayText() : undefined

    // For lockable fields, provide lock state and handlers
    const lockProps = field.lockable && field.lockableFieldName !== undefined ? {
      locked: isFieldLocked(field.lockableFieldName),
      showLockButton: useExistingMap,
      onLockToggle: createLockToggleHandler(field.lockableFieldName)
    } : {}

    // For CoordinatePair fields, provide per-coordinate lock state and lng value
    const cpConfig = field.coordinatePair
    const coordinatePairProps = field.type === FieldType.CoordinatePair && cpConfig ? {
      lngValue: (config?.[cpConfig.lngKey] as number) ?? 0,
      latLocked: cpConfig.latLockableFieldName ? isFieldLocked(cpConfig.latLockableFieldName) : false,
      lngLocked: cpConfig.lngLockableFieldName ? isFieldLocked(cpConfig.lngLockableFieldName) : false,
      showLockButton: useExistingMap,
      onLatLockToggle: cpConfig.latLockableFieldName ? createLockToggleHandler(cpConfig.latLockableFieldName) : undefined,
      onLngLockToggle: cpConfig.lngLockableFieldName ? createLockToggleHandler(cpConfig.lngLockableFieldName) : undefined,
    } : undefined

    return (
      <FieldRenderer
        key={field.key}
        field={field}
        value={value}
        onChange={onPropertyChange}
        disabled={readOnly}
        labelSuffix={labelSuffix}
        coordinatePairProps={coordinatePairProps}
        {...lockProps}
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
          <CopyableLabel label="Use Existing Map Widget" copyValue={String(useExistingMap)} showCopyButton={false} />
          <Switch
            checked={useExistingMap}
            onChange={(e) => onPropertyChange('useExistingMap', e.target.checked)}
          />
        </SettingRow>

        {useExistingMap ? (
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
            {mapSettingsFields.map((field) => renderField(field, false))}
          </div>
        </Collapse>

        <SourceConfigList
          sourceConfigs={config?.sourceConfigs || []}
          onChange={onSourceConfigsChange}
          readOnly={useExistingMap}
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
        <VisualBaseLayerList
          layers={config?.visualBaseLayers || []}
          onChange={(layers) => onPropertyChange(AudiomConfigKey.VisualBaseLayers, layers)}
        />
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