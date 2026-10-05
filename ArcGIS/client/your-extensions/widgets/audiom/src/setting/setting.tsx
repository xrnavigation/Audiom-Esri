import { DataSourceManager, Immutable, ImmutableObject, React, type DataSource, type IMDataSourceJson, type UseDataSource } from 'jimu-core'
import type { AllWidgetSettingProps } from 'jimu-for-builder'
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis'
import { MapWidgetSelector, SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components'
import { AllDataSourceTypes, DataSourceSelector } from 'jimu-ui/advanced/data-source-selector'
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
import { DEFAULT_CONFIG, FieldConfig, IAudiomConfig, ISourceConfig, setConfigValue, toMutableConfig } from './configs'
import { ButtonType, FieldType, FlowType, Colors } from './enums'
import { Padding } from './enums'
import { AudiomConfigKey, LockableFieldName } from './configKeys'
import { validateUrl, VALIDATION } from './validation/validation'
import {
  isEmbedRuntime,
  isIntegratedRuntime,
  isSettingVisible,
  RuntimeLocation,
  runtimeLocationOf
} from './runtimeLocation'

const { useEffect, useCallback, useState, useRef } = React

const logger = createLogger('Setting')

const MAP_SOURCE_TYPES = Immutable([
  AllDataSourceTypes.WebMap,
  AllDataSourceTypes.WebScene
])

const Setting = (props: AllWidgetSettingProps<ImmutableObject<IAudiomConfig>>) => {
  const { config } = props
  const mutableConfig = toMutableConfig(config)
  // Each widget id gets its own MapSyncManager instance — two audiom widgets
  // on the same page won't share listeners / initial-sync state / debounce
  // timers. The instance survives the settings panel being remounted
  // (e.g. switching widget tabs) because the registry is keyed by widget id.
  const mapSyncManager = getMapSyncManager(props.id)
  const [mapSettingsOpen, setMapSettingsOpen] = useState(true)
  // Bumps each time JimuMapViewComponent reports the active JimuMapView is
  // ready (or that the map id changed). Used to (re)trigger the
  // attach-to-map effect below â€” replaces the old setInterval-based polling.
  const [mapViewReadyTick, setMapViewReadyTick] = useState(0)

  // Helper to update config
  const updateConfig = useCallback((newConfig: ImmutableObject<IAudiomConfig>) => {
    props.onSettingChange({
      id: props.id,
      config: newConfig
    })
  }, [props])

  // Use the map sync state hook for lockable fields
  const {
    updateMapValues,
    isFieldLocked,
    createLockToggleHandler,
    fieldNeedsUpdate,
    syncLockedFieldsToConfig
  } = useMapSyncState(config, updateConfig)

  // Callback to apply synced config from MapSyncManager
  const applyConfigFromMap = useCallback((newMapConfig: MapSyncConfig) => {
    const mutableConfig = toMutableConfig(config)
    const currentSources = mutableConfig.sourceConfigs || []
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
      let newConfig = setConfigValue(config, AudiomConfigKey.SourceConfigs, mergedSources)
      
      // Sync all locked fields using the helper
      newConfig = syncLockedFieldsToConfig(newConfig, newMapConfig)

      logger.debug('Auto-sync settings: Updated config with', mergedSources.length, 'sources')

      updateConfig(newConfig)
    }
  }, [config, updateConfig, updateMapValues, fieldNeedsUpdate, syncLockedFieldsToConfig])

  const runtimeLocation = runtimeLocationOf(toMutableConfig(config))
  const bundled = runtimeLocation === RuntimeLocation.Bundled
  // Bundled draws its own web map or web scene. It never binds a Map widget.
  const effectiveMapId = bundled ? '' : (props.useMapWidgetIds?.[0] || config?.existingMapId || '')

  // Auto-sync existingMapId from props.useMapWidgetIds when it changes
  // This handles the case when the widget is first added and useMapWidgetIds gets populated
  useEffect(() => {
    if (bundled) return
    const mapIdFromProps = props.useMapWidgetIds?.[0]
    if (mapIdFromProps && config?.existingMapId !== mapIdFromProps) {
      logger.debug('Auto-syncing existingMapId from useMapWidgetIds:', mapIdFromProps)
      props.onSettingChange({
        id: props.id,
        config: setConfigValue(config, AudiomConfigKey.ExistingMapId, mapIdFromProps)
      })
    }
  }, [bundled, props.useMapWidgetIds, config?.existingMapId, props, config])

  // Initialize MapSyncManager: do the initial sync once when useExistingMap is
  // first enabled for a given map, but only subscribe to ongoing layer/zoom
  // changes when AUTO_SYNC_LAYERS is on.
  //
  // Initial sync tracking lives on the per-widget MapSyncManager instance, so
  // it persists across component remounts (ExB remounts settings when
  // switching widgets) without leaking state to other widgets.
  //
  // applyConfigFromMap depends on `config`, which changes on every edit. We
  // intentionally do NOT want this effect to re-run (re-attach, re-do initial
  // sync, etc.) every time the user changes a setting â€” only when the map id
  // or useExistingMap toggles. We pin the latest callback into a ref and read
  // it from inside the effect / from the change listener; this is the
  // "useEvent" / "useLatest" pattern (see RFC: react-events).
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

    // Try to attach. If the JimuMapView isn't registered yet (it hasn't been
    // created by the map widget) the JimuMapViewComponent rendered below
    // will fire onActiveViewChange once it is â€” that bumps mapViewReadyTick
    // and re-runs this effect.
    const attached = mapSyncManager.attach(effectiveMapId, mutableConfig)
    if (attached) {
      const initialConfig = mapSyncManager.getCurrentConfig(effectiveMapId)
      if (initialConfig) {
        applyConfigFromMapRef.current(initialConfig)
      }
      mapSyncManager.markInitialSyncDone(effectiveMapId)

      if (AUTO_SYNC_LAYERS) {
        mapSyncManager.addChangeListener(applyConfigFromMapRef.current)
      }
    }

    // Cleanup
    return () => {
      mapSyncManager.removeChangeListener(applyConfigFromMapRef.current)
    }
  // exhaustive-deps disabled intentionally: `config` is read inside the effect
  // (via applyConfigFromMapRef.current â†’ applyConfigFromMap closure) but we do
  // not want a re-run on every config change â€” only on map id / toggle change.
  // mapViewReadyTick is included so the effect retries once the underlying
  // JimuMapView becomes available.
  // See the useRef + ref-pinning pattern above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.useExistingMap, effectiveMapId, mapSyncManager, mapViewReadyTick])

  /**
   * Fired by JimuMapViewComponent whenever the active JimuMapView for the
   * selected map widget becomes available (or changes). We just bump a tick
   * so the attach-to-map effect re-runs and tryAttach succeeds without any
   * polling.
   */
  const handleActiveViewChange = useCallback((activeView: JimuMapView) => {
    if (activeView) {
      logger.debug('JimuMapViewComponent: active view ready', activeView.id)
      setMapViewReadyTick(t => t + 1)
    }
  }, [])

  const onMapWidgetSelected = (useMapWidgetIds: string[]) => {
    props.onSettingChange({
      id: props.id,
      useMapWidgetIds: useMapWidgetIds,
      config: setConfigValue(config, AudiomConfigKey.ExistingMapId, useMapWidgetIds[0] || '')
    })
  }

  const onMapSourceChange = (nextUseDataSources: UseDataSource[]) => {
    const selected = nextUseDataSources?.[0]
    const dataSourceId = selected?.dataSourceId || selected?.mainDataSourceId || ''
    const dsJson = dataSourceId
      ? DataSourceManager.getInstance().getDataSource(dataSourceId)?.getDataSourceJson?.()
      : undefined
    const itemId = (dsJson as IMDataSourceJson | undefined)?.itemId || ''
    props.onSettingChange({
      id: props.id,
      useDataSources: nextUseDataSources,
      useDataSourcesEnabled: true,
      config: setConfigValue(config, AudiomConfigKey.MapItemId, itemId)
    })
  }

  const onMapSourceCreated = (ds: DataSource) => {
    const itemId = (ds.getDataSourceJson?.() as IMDataSourceJson | undefined)?.itemId || ''
    if (!itemId || itemId === config?.mapItemId) return
    props.onSettingChange({
      id: props.id,
      config: setConfigValue(config, AudiomConfigKey.MapItemId, itemId)
    })
  }

  const onPropertyChange = (property: string, value: unknown) => {
    props.onSettingChange({
      id: props.id,
      config: setConfigValue(config, property as keyof IAudiomConfig, value as IAudiomConfig[keyof IAudiomConfig])
    })
  }

  const onSourceConfigsChange = (sourceConfigs: ISourceConfig[]) => {
    props.onSettingChange({
      id: props.id,
      config: setConfigValue(config, AudiomConfigKey.SourceConfigs, sourceConfigs)
    })
  }

  const onPreviewInAudiom = () => {
    // For preview, we use URL mode sources (not existing map sources since we don't have JimuMapView in settings)
    const previewConfig: IAudiomConfig = { ...mutableConfig, useExistingMap: false }
    const embedConfig = audiomConfigToEmbedConfig(previewConfig, undefined)

    const previewUrl = embedConfig.toUrl(previewConfig.baseUrl || DEFAULT_CONFIG.baseUrl)
    window.open(previewUrl, '_blank', 'noopener,noreferrer')
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

  const integrated = isIntegratedRuntime(runtimeLocation)

  // Connection fields - set once. Visibility follows the runtime location.
  const connectionFields: FieldConfig[] = [
    { key: AudiomConfigKey.ApiKey, label: 'API Key', type: FieldType.Password, placeholder: 'Enter API key' },
    { key: AudiomConfigKey.BaseUrl, label: 'Audiom Server Base URL', type: FieldType.Text, placeholder: 'Enter Audiom server URL', defaultValue: DEFAULT_CONFIG.baseUrl, validateOnAccept: (val) => validateUrl(String(val)), showWhen: () => isSettingVisible(AudiomConfigKey.BaseUrl, runtimeLocation) },
    { key: AudiomConfigKey.AssetBaseUrl, label: 'Asset Base URL', type: FieldType.Text, placeholder: 'https://audiom.net', defaultValue: DEFAULT_CONFIG.assetBaseUrl, validateOnAccept: (val) => validateUrl(String(val)), showWhen: () => isSettingVisible(AudiomConfigKey.AssetBaseUrl, runtimeLocation) },
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

  // Display fields - appearance and behavior
  const displayFields: FieldConfig[] = [
    { key: AudiomConfigKey.Title, label: 'Title', type: FieldType.Text, placeholder: 'Enter widget title', lockable: true, lockableFieldName: LockableFieldName.Title },
    { key: AudiomConfigKey.StepSize, label: 'Step Size', type: FieldType.Custom, showCopyButton: false, renderCustom: renderStepSizeUnitSelector },
    { key: AudiomConfigKey.ShowVisualMap, label: 'Show Visual Map', type: FieldType.Switch, defaultValue: DEFAULT_CONFIG.showVisualMap, showCopyButton: false, showWhen: () => isSettingVisible(AudiomConfigKey.ShowVisualMap, runtimeLocation) },
    { key: AudiomConfigKey.ShowHeading, label: 'Show Heading', type: FieldType.Switch, defaultValue: DEFAULT_CONFIG.showHeading, showCopyButton: false },
    { key: AudiomConfigKey.Heading, label: 'Heading Size', type: FieldType.Number, min: 1, max: 6, defaultValue: DEFAULT_CONFIG.heading, showCopyButton: false },
    { key: AudiomConfigKey.VisualStyle, label: 'Visual Style', type: FieldType.Enum, enumOptions: [{ label: 'Default', value: '' }, { label: 'Geology', value: 'geology' }], showCopyButton: false, showWhen: () => isSettingVisible(AudiomConfigKey.VisualStyle, runtimeLocation) }
  ]

  const useExistingMap = config?.useExistingMap ?? DEFAULT_CONFIG.useExistingMap

  const renderField = (field: FieldConfig, readOnly: boolean = false) => {
    const value = config?.[field.key as keyof IAudiomConfig] ?? field.defaultValue
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

  const visibleConnectionFields = connectionFields.filter((field) => field.showWhen?.(mutableConfig) !== false)
  const visibleDisplayFields = displayFields.filter((field) => {
    if (field.showWhen && !field.showWhen(mutableConfig)) return false
    if (field.key === AudiomConfigKey.Heading) {
      return config?.showHeading ?? DEFAULT_CONFIG.showHeading
    }
    return true
  })

  return (
    <div className="widget-setting-demo">
      {effectiveMapId ? (
        <JimuMapViewComponent
          useMapWidgetId={effectiveMapId}
          onActiveViewChange={handleActiveViewChange}
        />
      ) : null}
      <SettingSection title="Connection">
        <SettingRow flow={FlowType.Wrap}>
          <Label>Runtime location</Label>
          <ButtonGroup>
            {([
              [RuntimeLocation.Standalone, 'Standalone embed'],
              [RuntimeLocation.Bundled, 'Bundled']
            ] as const).map(([value, label]) => (
              <Button
                key={value}
                active={value === RuntimeLocation.Standalone
                  ? isEmbedRuntime(runtimeLocation)
                  : runtimeLocation === value}
                aria-pressed={value === RuntimeLocation.Standalone
                  ? isEmbedRuntime(runtimeLocation)
                  : runtimeLocation === value}
                onClick={() => onPropertyChange(AudiomConfigKey.RuntimeLocation, value)}
              >
                {label}
              </Button>
            ))}
          </ButtonGroup>
        </SettingRow>
        {visibleConnectionFields.map((field) => renderField(field, false))}
      </SettingSection>

      <SettingSection title="Map Configuration">
        {bundled ? (
          <SettingRow flow={FlowType.Wrap}>
            <CopyableLabel label="Source" copyValue={config?.mapItemId || ''} showCopyButton={false} />
            <div>A web map or web scene, or any combination of the two.</div>
            <DataSourceSelector
              types={MAP_SOURCE_TYPES}
              widgetId={props.id}
              useDataSources={props.useDataSources}
              isMultiple
              mustUseDataSource
              hideDataView
              disableDataView
              buttonLabel="Set"
              onChange={onMapSourceChange}
              onDataSourceCreated={onMapSourceCreated}
            />
          </SettingRow>
        ) : (
          <>
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
          </>
        )}
        {isSettingVisible(AudiomConfigKey.Zoom, runtimeLocation) ? (
          <>
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
          </>
        ) : null}
        <SourceConfigList
          apiKey={config?.apiKey ?? ''}
          baseUrl={config?.baseUrl || DEFAULT_CONFIG.baseUrl}
          sourceConfigs={mutableConfig.sourceConfigs || []}
          onChange={onSourceConfigsChange}
          readOnly={integrated || useExistingMap}
        />
      </SettingSection>

      <SettingSection title="Display">
        {visibleDisplayFields.map((field) => renderField(field, false))}
        {isSettingVisible(AudiomConfigKey.VisualBaseLayers, runtimeLocation) ? (
          <VisualBaseLayerList
            layers={mutableConfig.visualBaseLayers || []}
            onChange={(layers) => onPropertyChange(AudiomConfigKey.VisualBaseLayers, layers)}
          />
        ) : null}
        {isEmbedRuntime(runtimeLocation) ? (
          <>
            <SettingRow flow={FlowType.Wrap}>
              <Button
                type={ButtonType.Primary}
                style={{ width: '100%' }}
                onClick={onPreviewInAudiom}
                disabled={!isAudiomConfigValid(mutableConfig)}
              >
                Preview in Audiom
              </Button>
            </SettingRow>
            <SettingRow flow={FlowType.Wrap}>
              <Label style={{ width: '100%', color: Colors.TextMuted, fontSize: '12px' }}>
                {(!isAudiomConfigValid(mutableConfig))
                  ? 'API Key is required to preview in Audiom.'
                  : 'Opens the current configuration in a new tab.'}
              </Label>
            </SettingRow>
          </>
        ) : null}
      </SettingSection>
    </div>
  )
}

export default Setting
