import { type AllWidgetProps, React, ReactRedux, AppMode, type IMState } from 'jimu-core'
import { audiomConfigToEmbedConfig } from '../utils/mapUtils'
import { getMapSyncManager, AUTO_SYNC_LAYERS } from '../utils/mapSyncManager'
import { serializeLockedForDiff } from '../utils/sourceConfigUtils'
import { JimuMapView, JimuMapViewComponent } from 'jimu-arcgis'
import { DEFAULT_CONFIG, IAudiomConfig } from '../setting/configs'
import { sanitizeConfig, useLogWarnings as logWarnings } from '../setting/validation/validation'
import {
  hostedOriginDisclosure,
  isIntegratedRuntime,
  RuntimeLocation,
  runtimeLocationOf
} from '../setting/runtimeLocation'
import MessagePopup, { MessageType } from './components/MessagePopup'
import { JimuConfig } from '../utils/JimuConfig'
import { bundledStatus, startBundledRuntime, type BundledRuntimeHandle } from './bundledRuntime'
import {
  destroyMapSurface,
  mountEsriMap,
  type MountedMapSurface
} from './esriMapSurface'

const { useState, useEffect, useRef } = React

// Typed styles with full key/value validation
const styles = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100%'
  },
  iframe: {
    border: 0,
    width: '100%',
    height: '100%'
  }
} as const satisfies Record<string, React.CSSProperties>

const Widget = (props: AllWidgetProps<IAudiomConfig>) => {
  const [jimuMapView, setJimuMapView] = useState<JimuMapView>()
  const [mapSurface, setMapSurface] = useState<MountedMapSurface | null>(null)
  const [runtimeStatus, setRuntimeStatus] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [lastSyncedConfigJson, setLastSyncedConfigJson] = useState<string>('')
  // Per-widget MapSyncManager instance (shared with the same widget's
  // settings panel via the widget id key).
  const mapSyncManager = getMapSyncManager(props.id)
  
  // Check if Live View is enabled (appMode === Run means live view is active)
  const isLiveView = ReactRedux.useSelector((state: IMState) => 
    state?.appRuntimeInfo?.appMode === AppMode.Run
  )
  
  // Sanitize config on every render (pure function, always reflects current config)
  const { config: sanitizedConfig, warnings } = sanitizeConfig(props.config)
  
  // Log warnings once per unique set
  logWarnings(warnings)
  
  const activeViewChangeHandler = (jmv: JimuMapView) => {
    if (jmv) {
      setJimuMapView(jmv)
      // Clear changes indicator when map view is set (widget is being selected/focused)
      setHasChanges(false)
    }
  }

  // Listen for map changes to show the "changes detected" message
  useEffect(() => {
    if (!AUTO_SYNC_LAYERS || !sanitizedConfig?.useExistingMap || !sanitizedConfig?.existingMapId) {
      return
    }

    // Attach to the map and pass current config to detect initial mismatches
    mapSyncManager.attach(sanitizedConfig.existingMapId, sanitizedConfig)

    // Store the initial synced config (only locked sources for comparison)
    const initialJson = serializeLockedForDiff(sanitizedConfig.sourceConfigs)
    setLastSyncedConfigJson(initialJson)

    // Listen for changes
    const onMapChange = () => {
      if (mapSyncManager.hasChanges(sanitizedConfig.existingMapId, sanitizedConfig)) {
        setHasChanges(true)
      }
    }

    mapSyncManager.addChangeListener(onMapChange)

    return () => {
      mapSyncManager.removeChangeListener(onMapChange)
    }
  }, [sanitizedConfig?.useExistingMap, sanitizedConfig?.existingMapId, sanitizedConfig, mapSyncManager])

  // Clear changes indicator when config updates (means settings panel synced)
  // Only compare locked sources — unlocked sources are manually controlled
  useEffect(() => {
    const currentJson = serializeLockedForDiff(sanitizedConfig?.sourceConfigs)
    if (currentJson !== lastSyncedConfigJson && lastSyncedConfigJson !== '') {
      // Config changed, meaning settings panel likely synced it
      setHasChanges(false)
      setLastSyncedConfigJson(currentJson)
    } else if (lastSyncedConfigJson === '') {
      // Initial load
      setLastSyncedConfigJson(currentJson)
    }
  }, [sanitizedConfig?.sourceConfigs, lastSyncedConfigJson])

  const mapConfig = audiomConfigToEmbedConfig(sanitizedConfig as IAudiomConfig, jimuMapView)
  const embedUrl = mapConfig.toUrl(sanitizedConfig.baseUrl || DEFAULT_CONFIG.baseUrl)
  const runtimeLocation = runtimeLocationOf(sanitizedConfig)
  const title = props.config.title || 'Audiom'
  const bundledHandle = useBundledRuntime(
    runtimeLocation === RuntimeLocation.Bundled,
    props.id,
    jimuMapView,
    setRuntimeStatus,
    mapSurface
  )

  if (isIntegratedRuntime(runtimeLocation)) {
    const mapWidgetId = props.useMapWidgetIds?.[0] || sanitizedConfig.existingMapId
    const existingMap = (jimuMapView as { view?: { map?: unknown } } | undefined)?.view?.map
    const mapLabel = runtimeLocation === RuntimeLocation.Bundled
      ? bundledStatus(bundledHandle, false)
      : 'Esri map'
    return (
      <div
        className="jimu-widget"
        role="region"
        aria-label={title}
        style={styles.container}
      >
        {mapWidgetId && (
          <JimuMapViewComponent useMapWidgetId={mapWidgetId} onActiveViewChange={activeViewChangeHandler} />
        )}
        <EsriMapSurface
          existingMap={existingMap}
          longitude={sanitizedConfig.centerLongitude}
          latitude={sanitizedConfig.centerLatitude}
          zoom={sanitizedConfig.zoom}
          onSurface={setMapSurface}
        />
        <p className="sr-only" role="status">{mapLabel}{runtimeStatus ? `. ${runtimeStatus}` : ''}</p>
        {runtimeLocation === RuntimeLocation.Hosted ? (
          <p role="status">{hostedOriginDisclosure(sanitizedConfig.baseUrl)}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="jimu-widget" style={styles.container}>
      {props.useMapWidgetIds && props.useMapWidgetIds.length === 1 && (
        <JimuMapViewComponent useMapWidgetId={props.useMapWidgetIds?.[0]} onActiveViewChange={activeViewChangeHandler} />
      )}
      <MessagePopup 
        show={hasChanges && JimuConfig.getInstance().isInBuilder() && !isLiveView} 
        message="Map changes detected. Select the Audiom widget to re-synchronize."
        variant={MessageType.Warning}
      />
      <iframe
        name="audiom"
        src={embedUrl}
        style={styles.iframe}
        title={props.config.title || 'Audiom Widget'}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
        referrerPolicy="no-referrer"
      />
    </div>
  )
}

function EsriMapSurface (props: {
  existingMap?: unknown
  longitude?: number
  latitude?: number
  zoom?: number
  onSurface?: (surface: MountedMapSurface | null) => void
}): JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  const onSurface = props.onSurface
  useEffect(() => {
    const node = container.current
    if (!node) return
    let cancelled = false
    let surface: MountedMapSurface | null = null
    void mountEsriMap({
      container: node,
      existingMap: props.existingMap,
      longitude: props.longitude,
      latitude: props.latitude,
      zoom: props.zoom
    }).then((mounted) => {
      if (cancelled) {
        destroyMapSurface(mounted)
        return
      }
      surface = mounted
      onSurface?.(mounted)
    }).catch(() => onSurface?.(null))
    return () => {
      cancelled = true
      destroyMapSurface(surface)
      onSurface?.(null)
    }
  }, [props.existingMap, props.longitude, props.latitude, props.zoom, onSurface])
  return (
    <div
      id="audiom-esri-map"
      ref={container}
      className="widget-map mapview-container"
      role="application"
      aria-label="Esri map"
      style={{ width: '100%', height: '100%' }}
    />
  )
}

function useBundledRuntime (
  enabled: boolean,
  instanceId: string,
  jimuMapView: JimuMapView | undefined,
  onStatus: (status: string) => void,
  surface: MountedMapSurface | null
): BundledRuntimeHandle | null {
  const [handle, setHandle] = useState<BundledRuntimeHandle | null>(null)
  useEffect(() => {
    if (!enabled) {
      setHandle(null)
      return
    }
    const next = startBundledRuntime(instanceId, jimuMapView, onStatus, surface)
    setHandle(next)
    return () => { void next.runtime.dispose() }
  }, [enabled, instanceId, jimuMapView, onStatus, surface])
  return handle
}

export default Widget
