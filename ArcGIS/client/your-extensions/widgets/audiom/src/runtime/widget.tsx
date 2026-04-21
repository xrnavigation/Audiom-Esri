import { type AllWidgetProps, React, ReactRedux, AppMode, type IMState } from 'jimu-core'
import { audiomConfigToEmbedConfig } from '../utils/mapUtils'
import { getMapSyncManager, AUTO_SYNC_LAYERS, type MapSyncConfig } from '../utils/mapSyncManager'
import { mergeSourcesPreservingUnlocked, serializeLockedForDiff } from '../utils/sourceConfigUtils'
import { serializeReloadFields } from '../utils/embedUrlFields'
import { computeVisibilityFilters } from '../utils/visibilityFilters'
import { JimuMapView, JimuMapViewComponent } from 'jimu-arcgis'
import { DEFAULT_CONFIG, IAudiomConfig, ISourceConfig } from '../setting/configs'
import { sanitizeConfig, useLogWarnings as logWarnings } from '../setting/validation/validation'
import MessagePopup, { MessageType } from './components/MessagePopup'
import { JimuConfig } from '../utils/JimuConfig'
import {
  AudiomMessageHandler,
  AudiomOutboundEventType,
  type ISetFiltersPayload
} from '../../../../shared/audiom-client/AudiomMessages'

const { useState, useEffect, useMemo, useRef, useCallback } = React

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

/** How long the "Map updated" notice stays on screen after a reload-fallback. */
const MAP_UPDATED_NOTICE_MS = 3000

/** Derive the iframe target origin from the embed base URL. */
function deriveTargetOrigin(baseUrl: string): string | undefined {
  try {
    return new URL(baseUrl).origin
  } catch {
    return undefined
  }
}

/** True when two setFilters payloads describe the same visible-source set. */
function filtersEqual(a: ISetFiltersPayload, b: ISetFiltersPayload): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

const Widget = (props: AllWidgetProps<IAudiomConfig>) => {
  const [jimuMapView, setJimuMapView] = useState<JimuMapView>()
  const [hasChanges, setHasChanges] = useState(false)
  const [showMapUpdatedNotice, setShowMapUpdatedNotice] = useState(false)
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

  const runtimeAutoSync = sanitizedConfig.runtimeAutoSync ?? DEFAULT_CONFIG.runtimeAutoSync
  const inBuilder = JimuConfig.getInstance().isInBuilder()

  // ── iframe + postMessage handler ──────────────────────────────────────
  // The iframe ref + AudiomMessageHandler are kept in refs so they survive
  // re-renders. The handler instance lives for the lifetime of the widget;
  // the iframe element only changes when its `src` does (i.e. on reload).
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const handlerRef = useRef<AudiomMessageHandler | null>(null)
  // Last filter payload we sent — used to dedupe redundant postMessages.
  const lastSentFiltersRef = useRef<ISetFiltersPayload | null>(null)
  // Filters queued before Audiom signals Ready. Flushed on Ready.
  const pendingFiltersRef = useRef<ISetFiltersPayload | null>(null)
  const isReadyRef = useRef(false)
  // Latest sources for use inside the Ready callback (avoids re-running effect).
  const latestSourcesRef = useRef<ISourceConfig[] | undefined>(undefined)
  latestSourcesRef.current = sanitizedConfig.sourceConfigs as ISourceConfig[] | undefined

  // ── Stable iframe URL ─────────────────────────────────────────────────
  // The iframe `src` is recomputed only when a RELOAD-triggering field
  // changes. Visibility-only deltas (per-source `enabled` on locked sources)
  // are pushed via postMessage and do NOT change the URL → no reload.
  const reloadHash = serializeReloadFields(sanitizedConfig as IAudiomConfig)
  const embedUrl = useMemo(() => {
    const mapConfig = audiomConfigToEmbedConfig(sanitizedConfig as IAudiomConfig, jimuMapView)
    return mapConfig.toUrl(sanitizedConfig.baseUrl || DEFAULT_CONFIG.baseUrl)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadHash, jimuMapView])

  const targetOrigin = useMemo(
    () => deriveTargetOrigin(sanitizedConfig.baseUrl || DEFAULT_CONFIG.baseUrl),
    [sanitizedConfig.baseUrl]
  )

  // ── Send filters to the embed (or queue until Ready) ──────────────────
  const sendFilters = useCallback((filters: ISetFiltersPayload) => {
    if (!runtimeAutoSync) return
    if (lastSentFiltersRef.current && filtersEqual(lastSentFiltersRef.current, filters)) return

    const handler = handlerRef.current
    const iframe = iframeRef.current
    if (!handler || !iframe || !targetOrigin) return

    if (!isReadyRef.current) {
      // Buffer the latest payload; only the most recent matters.
      pendingFiltersRef.current = filters
      return
    }
    handler.setFilters(iframe, filters, targetOrigin)
    lastSentFiltersRef.current = filters
    pendingFiltersRef.current = null
  }, [runtimeAutoSync, targetOrigin])

  // ── Handler lifecycle (mount / unmount / Ready) ───────────────────────
  useEffect(() => {
    if (!targetOrigin) return undefined

    const handler = new AudiomMessageHandler(targetOrigin)
    handlerRef.current = handler

    const onReady = () => {
      isReadyRef.current = true
      // Flush any pending payload that arrived before Ready, plus push the
      // current visibility state so Audiom matches the widget on first load
      // (in case the URL `filters=` param wasn't authoritative).
      const pending = pendingFiltersRef.current
        ?? computeVisibilityFilters(latestSourcesRef.current)
      const iframe = iframeRef.current
      if (iframe && runtimeAutoSync) {
        handler.setFilters(iframe, pending, targetOrigin)
        lastSentFiltersRef.current = pending
        pendingFiltersRef.current = null
      }
    }

    handler.on(AudiomOutboundEventType.Ready, onReady)

    return () => {
      handler.off(AudiomOutboundEventType.Ready, onReady)
      handler.dispose()
      handlerRef.current = null
      isReadyRef.current = false
      lastSentFiltersRef.current = null
      pendingFiltersRef.current = null
    }
  }, [targetOrigin, runtimeAutoSync])

  // The iframe element changes when `src` changes (reload). Reset Ready
  // state so the next Ready event re-flushes the current visibility filters.
  useEffect(() => {
    isReadyRef.current = false
    lastSentFiltersRef.current = null
  }, [embedUrl])

  // ── Map-view wiring ───────────────────────────────────────────────────
  const activeViewChangeHandler = (jmv: JimuMapView) => {
    if (jmv) {
      setJimuMapView(jmv)
      setHasChanges(false)
    }
  }

  // Latest values pinned into refs so the MapSyncManager listener doesn't
  // need to re-attach on every config edit (which would tear down the
  // subscription mid-debounce).
  const onSettingChangeRef = useRef((props as any).onSettingChange)
  onSettingChangeRef.current = (props as any).onSettingChange
  const widgetIdRef = useRef(props.id)
  widgetIdRef.current = props.id
  const sanitizedConfigRef = useRef<IAudiomConfig>(sanitizedConfig as IAudiomConfig)
  sanitizedConfigRef.current = sanitizedConfig as IAudiomConfig
  const sendFiltersRef = useRef(sendFilters)
  sendFiltersRef.current = sendFilters
  const runtimeAutoSyncRef = useRef(runtimeAutoSync)
  runtimeAutoSyncRef.current = runtimeAutoSync

  // ── MapSyncManager change dispatcher ──────────────────────────────────
  // Replaces the legacy "popup-only" listener: when a map change fires,
  // classify the delta and either (a) push a setFilters postMessage with
  // no reload, or (b) write through to widget config which forces a reload
  // and shows a brief "Map updated" notice. When runtimeAutoSync is off we
  // fall back to legacy "Select widget to re-sync" behavior.
  useEffect(() => {
    if (!AUTO_SYNC_LAYERS) return undefined
    if (!sanitizedConfig?.useExistingMap || !sanitizedConfig?.existingMapId) return undefined

    // Attach to the map and pass current config to detect initial mismatches
    mapSyncManager.attach(sanitizedConfig.existingMapId, sanitizedConfig)

    // Store the initial synced config (only locked sources for comparison)
    const initialJson = serializeLockedForDiff(sanitizedConfig.sourceConfigs)
    setLastSyncedConfigJson(initialJson)

    const onMapChange = (newMapConfig: MapSyncConfig) => {
      const currentConfig = sanitizedConfigRef.current
      if (!runtimeAutoSyncRef.current) {
        // Legacy behavior: just signal the user via the popup.
        if (mapSyncManager.hasChanges(currentConfig.existingMapId || '', currentConfig)) {
          setHasChanges(true)
        }
        return
      }

      // Merge fresh map sources with current widget config (preserving
      // unlocked / user-controlled fields).
      const currentSources = currentConfig.sourceConfigs as ISourceConfig[] | undefined
      const mapSources = (newMapConfig.sourceConfigs || []) as ISourceConfig[]
      const mergedSources = mergeSourcesPreservingUnlocked(currentSources || [], mapSources)

      // Did anything OTHER than per-source `enabled` change? If so we need
      // a reload. Compare reload-hashes computed off the projected source
      // shape (which omits `enabled`).
      const beforeHash = serializeReloadFields(currentConfig)
      // Note: `sanitizedConfig` is a plain object (sanitizeConfig spreads),
      // so we can't use the ImmutableObject `.set` helper here. A shallow
      // spread is sufficient — onSettingChange wraps the result.
      const candidateConfig: IAudiomConfig = {
        ...currentConfig,
        sourceConfigs: mergedSources
      }
      const afterHash = serializeReloadFields(candidateConfig)
      const isVisibilityOnly = beforeHash === afterHash

      const onSettingChange = onSettingChangeRef.current
      if (isVisibilityOnly) {
        // Push the new filter set; persist the visibility update through
        // onSettingChange so the saved config reflects reality on the next
        // page load. This is safe because the reload-hash is unchanged →
        // memoized `embedUrl` does not change → no iframe reload.
        sendFiltersRef.current(computeVisibilityFilters(mergedSources))
        if (onSettingChange) {
          onSettingChange({ id: widgetIdRef.current, config: candidateConfig })
        }
        setHasChanges(false)
      } else {
        // Reload-required delta. Surface a brief notice and let the URL
        // change drive the reload via onSettingChange.
        if (onSettingChange) {
          onSettingChange({ id: widgetIdRef.current, config: candidateConfig })
        }
        setShowMapUpdatedNotice(true)
        setHasChanges(false)
      }
    }

    mapSyncManager.addChangeListener(onMapChange)
    return () => {
      mapSyncManager.removeChangeListener(onMapChange)
    }
  // We deliberately do NOT depend on `sanitizedConfig` itself — re-attaching
  // on every config edit would tear down the subscription mid-debounce.
  // The closure reads the latest config via the refs above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sanitizedConfig?.useExistingMap,
    sanitizedConfig?.existingMapId,
    mapSyncManager
  ])

  // Auto-dismiss the "Map updated" notice
  useEffect(() => {
    if (!showMapUpdatedNotice) return undefined
    const t = setTimeout(() => setShowMapUpdatedNotice(false), MAP_UPDATED_NOTICE_MS)
    return () => { clearTimeout(t) }
  }, [showMapUpdatedNotice])

  // Clear changes indicator when config updates (means settings panel synced)
  useEffect(() => {
    const currentJson = serializeLockedForDiff(sanitizedConfig?.sourceConfigs)
    if (currentJson !== lastSyncedConfigJson && lastSyncedConfigJson !== '') {
      setHasChanges(false)
      setLastSyncedConfigJson(currentJson)
    } else if (lastSyncedConfigJson === '') {
      setLastSyncedConfigJson(currentJson)
    }
  }, [sanitizedConfig?.sourceConfigs, lastSyncedConfigJson])

  // Decide which popup to show:
  // - Reload-fallback notice always wins (both modes).
  // - Legacy "Select widget to re-sync" only fires in builder/non-live view
  //   when runtimeAutoSync is OFF (auto-sync is on by default, so this is
  //   the opt-out path).
  const showLegacyPopup = hasChanges && inBuilder && !isLiveView && !runtimeAutoSync

  return (
    <div className="jimu-widget" style={styles.container}>
      {props.useMapWidgetIds && props.useMapWidgetIds.length === 1 && (
        <JimuMapViewComponent useMapWidgetId={props.useMapWidgetIds?.[0]} onActiveViewChange={activeViewChangeHandler} />
      )}
      <MessagePopup
        show={showMapUpdatedNotice}
        message="Map updated"
        variant={MessageType.Notification}
      />
      <MessagePopup
        show={showLegacyPopup && !showMapUpdatedNotice}
        message="Map changes detected. Select the Audiom widget to re-synchronize."
        variant={MessageType.Warning}
      />
      <iframe
        ref={iframeRef}
        name="audiom"
        src={embedUrl}
        style={styles.iframe}
        title={props.config.title || 'Audiom Widget'}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
        referrerPolicy="no-referrer"
        allowFullScreen
      />
    </div>
  )
}

export default Widget
