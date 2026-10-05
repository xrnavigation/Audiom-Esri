import { type AllWidgetProps, React, ReactRedux, AppMode, type IMState, type ImmutableObject } from 'jimu-core'
import { audiomConfigToEmbedConfig } from '../utils/mapUtils'
import { getMapSyncManager, AUTO_SYNC_LAYERS } from '../utils/mapSyncManager'
import { serializeLockedForDiff } from '../utils/sourceConfigUtils'
import { JimuMapView, JimuMapViewComponent } from 'jimu-arcgis'
import { DEFAULT_CONFIG, IAudiomConfig, toMutableConfig } from '../setting/configs'
import { sanitizeConfig, useLogWarnings as logWarnings } from '../setting/validation/validation'
import {
  isIntegratedRuntime,
  RuntimeLocation,
  runtimeLocationOf
} from '../setting/runtimeLocation'
import MessagePopup, { MessageType } from './components/MessagePopup'
import { JimuConfig } from '../utils/JimuConfig'
import { patternLegend, patternTileUrl } from './audiomSymbols'
import { bundledFocusTarget, bundledStatus, startBundledRuntime, unlockBundledAudio, type BundledRuntimeHandle } from './bundledRuntime'
import { StepSize, StepSizeUnit } from '../../../../shared/audiom-client/StepSize'
import {
  avatarScreenPoint,
  destroyMapSurface,
  mountEsriMap,
  showAvatar,
  type MountedMapSurface
} from './esriMapSurface'
import type { ReportedAvatar } from './reportedAvatar'

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

const Widget = (props: AllWidgetProps<ImmutableObject<IAudiomConfig>>) => {
  const [jimuMapView, setJimuMapView] = useState<JimuMapView>()
  const [mapSurface, setMapSurface] = useState<MountedMapSurface | null>(null)
  const [avatar, setAvatar] = useState<ReportedAvatar | null>(null)
  const [indicatorScreen, setIndicatorScreen] = useState<{ x: number, y: number } | null>(null)
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
  
  const { config: sanitizedConfig, warnings } = sanitizeConfig(toMutableConfig(props.config))
  
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

  const mapConfig = audiomConfigToEmbedConfig({ ...DEFAULT_CONFIG, ...sanitizedConfig }, jimuMapView)
  const embedUrl = mapConfig.toUrl(sanitizedConfig.baseUrl || DEFAULT_CONFIG.baseUrl)
  const runtimeLocation = runtimeLocationOf(sanitizedConfig)
  const title = props.config.title || 'Audiom'
  const bundledHandle = useBundledRuntime(
    runtimeLocation === RuntimeLocation.Bundled,
    props.id,
    jimuMapView,
    setRuntimeStatus,
    mapSurface,
    setAvatar,
    sanitizedConfig.centerLongitude,
    sanitizedConfig.centerLatitude,
    stepSizeMeters(sanitizedConfig.stepSize, sanitizedConfig.stepSizeUnit),
    sanitizedConfig.soundpackUrl
  )

  if (isIntegratedRuntime(runtimeLocation)) {
    const bundled = runtimeLocation === RuntimeLocation.Bundled
    const mapWidgetId = bundled ? '' : (props.useMapWidgetIds?.[0] || sanitizedConfig.existingMapId)
    const existingMap = bundled
      ? undefined
      : (jimuMapView as { view?: { map?: unknown } } | undefined)?.view?.map
    const mapLabel = bundledStatus(bundledHandle, false)
    const scene = bundled && props.useDataSources?.some((source) =>
      String(source.dataSourceId || '').toUpperCase().includes('WEB_SCENE')
    )
    return (
      <div
        className="jimu-widget"
        role="region"
        aria-label={title}
        style={styles.container}
      >
        {!bundled && mapWidgetId && (
          <JimuMapViewComponent useMapWidgetId={mapWidgetId} onActiveViewChange={activeViewChangeHandler} />
        )}
        <div style={styles.container}>
          <EsriMapSurface
            existingMap={existingMap}
            mapItemId={bundled ? sanitizedConfig.mapItemId : undefined}
            scene={scene}
            longitude={sanitizedConfig.centerLongitude}
            latitude={sanitizedConfig.centerLatitude}
            zoom={sanitizedConfig.zoom}
            avatar={avatar}
            onMove={runtimeLocation === RuntimeLocation.Bundled
              ? (direction) => { void bundledHandle?.runtime.moveAvatar(direction) }
              : undefined}
            onSelect={runtimeLocation === RuntimeLocation.Bundled
              ? () => { void bundledHandle?.runtime.focusRuntime(bundledFocusTarget) }
              : undefined}
            onSurface={setMapSurface}
            onScreen={setIndicatorScreen}
          />
          <AudiomIndicator
            avatar={avatar}
            screen={indicatorScreen}
            onMove={runtimeLocation === RuntimeLocation.Bundled
              ? (direction) => { void bundledHandle?.runtime.moveAvatar(direction) }
              : undefined}
            onSelect={runtimeLocation === RuntimeLocation.Bundled
              ? () => {
                unlockBundledAudio(bundledHandle)
                void bundledHandle?.runtime.focusRuntime(bundledFocusTarget)
              }
              : undefined}
          />
          {runtimeLocation === RuntimeLocation.Bundled && (
            <AudiomSoundControl
              soundpackUrl={sanitizedConfig.soundpackUrl}
              onUnlock={() => { unlockBundledAudio(bundledHandle) }}
            />
          )}
          {runtimeLocation === RuntimeLocation.Bundled && <AudiomPatternKey />}
        </div>
        <p className="sr-only" role="status">
          {avatar
            ? `Position ${avatar.longitude.toFixed(3)}, ${avatar.latitude.toFixed(3)}. Heading ${Math.round(avatar.heading)} degrees.`
            : mapLabel}
          {runtimeStatus ? `. ${runtimeStatus}` : ''}
        </p>
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
  mapItemId?: string
  scene?: boolean
  longitude?: number
  latitude?: number
  zoom?: number
  avatar?: ReportedAvatar | null
  onMove?: (direction: string) => void
  onSelect?: () => void
  onScreen?: (point: { x: number, y: number } | null) => void
  onSurface?: (surface: MountedMapSurface | null) => void
}): JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  const onSurface = props.onSurface
  const onScreen = props.onScreen
  const onSelect = props.onSelect
  const [screen, setScreen] = useState<{ x: number, y: number } | null>(null)
  const [surfaceReady, setSurfaceReady] = useState(false)
  const avatar = props.avatar
  useEffect(() => {
    const node = container.current
    if (!node) return
    let cancelled = false
    let surface: MountedMapSurface | null = null
    void mountEsriMap({
      container: node,
      existingMap: props.existingMap,
      mapItemId: props.mapItemId,
      scene: props.scene,
      longitude: props.longitude,
      latitude: props.latitude,
      zoom: props.zoom
    }).then((mounted) => {
      if (cancelled) {
        destroyMapSurface(mounted)
        return
      }
      surface = mounted
      mounted.onIndicatorClick = () => {
        node.focus()
        onSelect?.()
      }
      ;(node as { __audiomSurface?: MountedMapSurface }).__audiomSurface = mounted
      setSurfaceReady(true)
      onSurface?.(mounted)
    }).catch(() => {
      setSurfaceReady(false)
      onSurface?.(null)
    })
    return () => {
      cancelled = true
      setSurfaceReady(false)
      destroyMapSurface(surface)
      delete (node as { __audiomSurface?: MountedMapSurface }).__audiomSurface
      onSurface?.(null)
    }
  }, [props.existingMap, props.mapItemId, props.scene, props.longitude, props.latitude, props.zoom, onSurface])
  useEffect(() => {
    const node = container.current as { __audiomSurface?: MountedMapSurface } | null
    if (!node?.__audiomSurface) return
    node.__audiomSurface.onIndicatorClick = () => {
      container.current?.focus()
      onSelect?.()
    }
  }, [onSelect])
  useEffect(() => {
    const node = container.current as { __audiomSurface?: MountedMapSurface } | null
    const surface = node?.__audiomSurface
    if (!surface || !avatar) {
      setScreen(null)
      onScreen?.(null)
      return
    }
    let cancelled = false
    const place = () => {
      void avatarScreenPoint(surface, avatar).then((point) => {
        if (cancelled) return
        setScreen(point)
        onScreen?.(point)
      })
    }
    void surface.view.when?.().then(() => {
      if (!cancelled) place()
    })
    place()
    const watch = surface.view.watch?.('extent', place)
    const stationary = surface.view.watch?.('stationary', place)
    const resize = surface.view.watch?.('size', place)
    const pointer = surface.view.on?.('pointer-move', place)
    return () => {
      cancelled = true
      watch?.remove?.()
      stationary?.remove?.()
      resize?.remove?.()
      pointer?.remove?.()
    }
  }, [avatar, surfaceReady, onScreen])
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const direction = movementDirection(event.key)
    if (!direction || !props.onMove) return
    event.preventDefault()
    event.stopPropagation()
    props.onMove(direction)
  }
  return (
    <div
      id="audiom-esri-map"
      ref={container}
      className="widget-map mapview-container"
      role="application"
      aria-label="Audiom map"
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={{ width: '100%', height: '100%' }}
    />
  )
}

/**
 * Audiom's compass, drawn by this widget's React. The component cannot be
 * mounted inside the map div: Esri replaces that node's children.
 * Paths are Audiom's VisualCursor paths.
 */
function AudiomIndicator (props: {
  avatar: ReportedAvatar | null
  screen: { x: number, y: number } | null
  onMove?: (direction: string) => void
  onSelect?: () => void
}): JSX.Element | null {
  const button = useRef<HTMLButtonElement>(null)
  const avatar = props.avatar
  const screen = props.screen
  useEffect(() => {
    if (avatar && screen) button.current?.focus()
  }, [avatar, screen])
  if (!avatar || !screen) return null
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const direction = movementDirection(event.key)
    if (!direction || !props.onMove) return
    event.preventDefault()
    event.stopPropagation()
    props.onMove(direction)
  }
  return (
    <>
      <button
        type="button"
        className="audiom-cursor"
        aria-label="Audiom navigation indicator"
        ref={button}
        onKeyDown={onKeyDown}
        onClick={() => { props.onSelect?.() }}
        style={{
          position: 'absolute',
          left: screen.x,
          top: screen.y,
          width: 52,
          height: 52,
          marginLeft: -26,
          marginTop: -26,
          padding: 0,
          border: 0,
          borderRadius: '50%',
          background: 'transparent',
          zIndex: 5,
          cursor: 'pointer',
          transform: `rotate(${avatar.heading}deg)`
        }}
      >
        <AudiomCompass />
      </button>
      <style>{AUDIOM_CURSOR_PULSE}</style>
    </>
  )
}

/** Pattern key for Audiom's five fill tokens. A sibling of the map div. */
function AudiomPatternKey (): JSX.Element {
  return (
    <ul
      aria-label="Audiom patterns"
      style={{
        position: 'absolute',
        right: 8,
        bottom: 8,
        zIndex: 3,
        margin: 0,
        padding: '0.35rem 0.5rem',
        listStyle: 'none',
        background: '#fff',
        color: '#04203e',
        border: '1px solid #04203e',
        borderRadius: 4
      }}
    >
      {patternLegend.map((item) => (
        <li key={item.token} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <img src={patternTileUrl(item.token)} alt="" width={16} height={16} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

/**
 * Audiom's sound unlock. A sibling of the map div, never a child of it.
 * The click resumes Audiom's audio context. This widget does not play a beep.
 */
function AudiomSoundControl (props: {
  soundpackUrl?: string
  onUnlock: () => void
}): JSX.Element | null {
  if (!props.soundpackUrl) return null
  return (
    <button
      type="button"
      onClick={props.onUnlock}
      style={{
        position: 'absolute',
        left: 8,
        bottom: 8,
        zIndex: 3,
        padding: '0.4rem 0.7rem',
        border: '1px solid #04203e',
        borderRadius: 4,
        background: '#fff',
        color: '#04203e'
      }}
    >
      Turn sound on
    </button>
  )
}

/** Audiom VisualCursor paths. Rendered with jimu-core React, not Audiom's React. */
function AudiomCompass (): JSX.Element {
  return (
    <svg width="33" height="30" viewBox="0 0 337 308" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M331.07 256.95L303.27 208.32L257.64 128.46L257.17 127.66L247.36 110.49L238.96 95.82L193.12 15.63C188.07 6.77001 178.34 1.04001 168.35 1.04001H167.34C157.39 1.04001 148.35 6.47001 143.17 15.55L88.8899 110.49L78.3499 128.9L78.2899 129.03L54.75 170.21L32.95 208.32L15.9899 238L5.21995 256.86C-0.290052 266.5 -0.670052 278.22 4.20995 288.19C9.87995 299.83 21.4299 307.06 34.3499 307.06H127.71C138 307.06 148.12 303.55 156.28 297.1L156.5 296.92C157.01 296.5 157.51 296.09 158.02 295.63C160.96 293.08 163.58 290.13 165.82 286.84L168.16 283.4L170.5 286.85C179.09 299.5 193.35 307.05 208.63 307.05H301.96C308.36 307.05 314.55 305.27 319.89 301.9L320.46 301.54L320.96 301.09C324.49 297.92 327.71 294.38 330.53 290.57L331.96 288.64L332.29 287.94C337 278 336.54 266.41 331.09 256.95H331.07ZM143.7 271.82C142.76 273.2 141.65 274.44 140.41 275.51L140.24 275.66C140.02 275.86 139.8 276.03 139.59 276.21C136.21 278.86 131.99 280.33 127.7 280.33H34.34C31.68 280.33 29.3999 278.89 28.2199 276.48C27.6299 275.27 26.8699 272.83 28.4199 270.12L39.1899 251.26L56.15 221.59L77.9499 183.48L101.86 141.65L101.92 141.53L112.09 123.76L166.38 28.8C166.83 28.02 167.27 27.78 167.33 27.76L167.83 27.8L168.35 27.77C168.67 27.77 169.51 28.17 169.91 28.88L215.76 109.09L224.16 123.76L234.06 141.09L234.48 141.79L280.07 221.58L307.31 269.24V277.71C306.06 279.37 304.13 280.32 301.94 280.32H208.61C202.18 280.32 196.19 277.15 192.59 271.84L168.13 235.78L143.69 271.82H143.7Z" fill="#000" stroke="#000" />
      <path d="M241.01 137.13L240.04 137.75H241.38L241.01 137.13Z" fill="#0088A6" />
      <path d="M315.34 279.92L315.31 279.89C315.31 279.89 315.28 279.95 315.25 279.98L264.87 247.28L219.18 217.61L168.14 184.47L167.85 19.77C171.19 19.55 174.95 21.55 176.86 24.89L222.71 105.1L231.11 119.78L241.01 137.11L240.04 137.73H241.38L252.75 157.63L287.01 217.6L303.97 247.27L314.81 266.23C317.4 270.73 317.31 275.76 315.34 279.91V279.92Z" fill="#0088A6" />
      <path d="M315.25 279.99C312.94 284.8 308.04 288.33 301.94 288.33H208.61C199.55 288.33 191.06 283.83 185.97 276.34L184.72 274.5L168.14 250.04L150.31 276.34C148.97 278.31 147.41 280.06 145.63 281.59C145.29 281.9 144.94 282.18 144.6 282.46C139.85 286.21 133.92 288.33 127.7 288.33H34.34C28.25 288.33 23.38 284.8 21.03 279.99L71.38 247.29L117.04 217.62L137.25 204.5L168.11 184.45H168.14V184.48L219.18 217.62L264.87 247.29L315.25 279.99Z" fill="#0097B7" />
      <path d="M167.85 19.78L168.14 184.44H168.11L137.25 204.49L117.04 217.61L71.3801 247.28L21.0301 279.98C19.0001 275.83 18.8401 270.73 21.4701 266.14L32.2501 247.27L49.2101 217.6L71.0101 179.5L94.8101 137.87L94.8701 137.74L105.15 119.78L116.24 100.38L159.44 24.83C161.35 21.49 164.52 19.55 167.86 19.77L167.85 19.78Z" fill="#00A9DA" />
    </svg>
  )
}

/** Audiom's cursor pulse. Same keyframes as AudioMapControls `.control:focus::after`. */
const AUDIOM_CURSOR_PULSE = `
.audiom-cursor { position: relative; }
.audiom-cursor svg { width: 1.75rem; height: auto; display: block; margin: 0 auto; }
.audiom-cursor:focus { outline: none; }
.audiom-cursor:focus::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #04203e;
  border-radius: 50%;
  z-index: -1;
  animation: audiom-grow-and-fade 1.75s infinite;
}
@keyframes audiom-grow-and-fade {
  from { opacity: 1; transform: scale(0); }
  to { opacity: 0; transform: scale(1.25); }
}
@media (prefers-reduced-motion: reduce) {
  .audiom-cursor:focus::after { animation: none; }
}
`

function stepSizeMeters (value?: number, unit?: StepSizeUnit): number | undefined {
  const size = value ?? DEFAULT_CONFIG.stepSize
  const stepUnit = unit ?? DEFAULT_CONFIG.stepSizeUnit
  if (!size || size <= 0) return undefined
  return StepSize.create(size, stepUnit).toMeters().value
}

function movementDirection (key: string): string | null {
  if (key === 'ArrowUp') return 'up'
  if (key === 'ArrowDown') return 'down'
  if (key === 'ArrowLeft') return 'left'
  if (key === 'ArrowRight') return 'right'
  return null
}

function useBundledRuntime (
  enabled: boolean,
  instanceId: string,
  jimuMapView: JimuMapView | undefined,
  onStatus: (status: string) => void,
  surface: MountedMapSurface | null,
  onAvatar: (position: ReportedAvatar | null) => void,
  longitude?: number,
  latitude?: number,
  moveDistance?: number,
  soundpackUrl?: string
): BundledRuntimeHandle | null {
  const [handle, setHandle] = useState<BundledRuntimeHandle | null>(null)
  const [reported, setReported] = useState<ReportedAvatar | null>(null)
  useEffect(() => {
    if (!enabled) {
      setHandle(null)
      setReported(null)
      onAvatar(null)
      return
    }
    const next = startBundledRuntime(
      instanceId,
      jimuMapView,
      onStatus,
      null,
      { longitude, latitude, moveDistance, soundpackUrl }
    )
    next.onReported = (state) => {
      const position = {
        longitude: state.position.longitude,
        latitude: state.position.latitude,
        heading: state.orientation
      }
      setReported(position)
      onAvatar(position)
    }
    setHandle(next)
    return () => {
      next.onReported = undefined
      setReported(null)
      onAvatar(null)
      void next.runtime.dispose()
    }
  }, [enabled, instanceId, jimuMapView, onStatus, onAvatar, longitude, latitude, moveDistance, soundpackUrl])
  useEffect(() => {
    if (!surface || !reported) return
    void showAvatar(surface, reported)
  }, [surface, reported])
  return handle
}

export default Widget
