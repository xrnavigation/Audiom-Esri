import {
  CONTRACT_VERSION,
  type AppliedResult,
  type AudiomRuntime,
  type AvatarState,
  type CanonicalKey,
  type ContractError,
  FocusTarget,
  type FocusResult,
  SelectionOp,
  type SelectionResult,
  type Viewpoint,
  WidgetLifecycle
} from '../../../../shared/audiom-runtime/src/types'
import {
  createInProcessRuntime,
  type InProcessRuntime
} from '../../../../shared/audiom-runtime/src/factory'
import { applyAudiomSymbols, restoreAudiomSymbols, type SymbolLayer, type SymbolModules, type VectorStyleMode } from './audiomSymbols'
import { snapshotFeaturesFromMapView, type SnapshotLayer, type SnapshotMapView } from './mapSnapshot'
import type { MapSnapshot } from '../../../../shared/audiom-runtime/src/types'
import { showAvatar, type MountedMapSurface } from './esriMapSurface'
import { audiomProgramError, createAudiomProgram, type AudiomProgram } from './audiomProgram'

export interface BundledRuntimeHandle {
  runtime: InProcessRuntime
  appliedSources: number
  lastError: string
  avatar: AvatarState | null
  /** True only after Audiom reports a position. The widget never invents one. */
  reported: boolean
  /** Called only when Audiom reports a new avatar state. */
  onReported?: (state: AvatarState) => void
  /** True when Audiom asked the host to unlock audio. */
  activationRequired: boolean
  /** The compiled Audiom program, when it loaded. */
  program: AudiomProgram | null
  /** The map mounted after this runtime started. Go pans this view. */
  bindSurface?: (surface: MountedMapSurface | null) => void
}

const applied = (revision = 0): AppliedResult => ({ applied: true, revision })

/** Runs the runtime package in this widget. The Esri map stays the map. */
export function startBundledRuntime (
  instanceId: string,
  jimuMapView: SnapshotMapView | undefined,
  onStatus: (status: string) => void,
  surface: MountedMapSurface | null = null,
  origin?: { longitude?: number, latitude?: number, moveDistance?: number, soundpackUrl?: string }
): BundledRuntimeHandle {
  const handle: BundledRuntimeHandle = {
    runtime: null as unknown as InProcessRuntime,
    appliedSources: 0,
    lastError: '',
    avatar: null,
    reported: false,
    activationRequired: false,
    program: null
  }
  let program: AudiomProgram | null = null
  // The map is mounted after this runtime starts. Go reads the surface that
  // exists at report time, not the null passed into startBundledRuntime.
  let drawnSurface = surface
  const host = {
    onAvatarChanged (state: AvatarState) {
      handle.avatar = state
      handle.reported = true
      handle.onReported?.(state)
      const mapSurface = drawnSurface
      void showAvatar(mapSurface, {
        longitude: state.position.longitude,
        latitude: state.position.latitude,
        heading: state.orientation
      })
      // Go can land outside the current view. Pan there so the compass,
      // which only draws inside the view, is not hidden.
      if (mapSurface?.view.goTo) {
        void mapSurface.view.goTo({
          center: [state.position.longitude, state.position.latitude]
        }).catch(() => undefined)
      }
      return Promise.resolve(applied())
    },
    requestSelection () {
      const result: SelectionResult = { accepted: true, revision: 1 }
      return Promise.resolve(result)
    },
    requestViewpoint (viewpoint: Viewpoint) {
      onStatus(`Viewpoint ${viewpoint.center.longitude}, ${viewpoint.center.latitude}`)
      return Promise.resolve(applied())
    },
    requestHostFocus () {
      const result: FocusResult = { focused: true, blocked: false }
      return Promise.resolve(result)
    },
    onFocusChanged () { return Promise.resolve(applied()) },
    onActivationRequired () {
      handle.activationRequired = true
      onStatus('Select the map to turn sound on')
      return Promise.resolve(applied())
    },
    onFeatureEntered (keys: CanonicalKey[]) {
      onStatus(keys.length ? `Entered ${keys.length}` : 'Entered')
      return Promise.resolve(applied())
    },
    onFeatureExited () { return Promise.resolve(applied()) },
    onRuntimeStatus (status: string) {
      onStatus(status)
      return Promise.resolve(applied())
    },
    onRuntimeError (error: ContractError) {
      handle.lastError = error.message
      onStatus(error.message)
      return Promise.resolve(applied())
    }
  }
  handle.bindSurface = (next) => {
    drawnSurface = next
  }
  program = createAudiomProgram({
    instanceId,
    longitude: origin?.longitude,
    latitude: origin?.latitude,
    moveDistance: origin?.moveDistance,
    soundpackUrl: origin?.soundpackUrl
  }, host)
  handle.program = program
  if (program) {
    handle.runtime = program.runtime
  } else {
    handle.lastError = audiomProgramError() || 'Audiom program failed to load'
    // eslint-disable-next-line no-console
    console.error('Audiom program failed to load:', handle.lastError)
    handle.runtime = createInProcessRuntime({
      sessionId: `${instanceId}-session`,
      instanceId,
      moveAvatar () {
        return null
      }
    }, host)
    onStatus(handle.lastError)
  }
  void handle.runtime.hello({
    product: 'Experience Builder',
    version: '1.18',
    contractVersion: CONTRACT_VERSION,
    capabilities: ['existing-map']
  }).then(async () => {
    const start = program?.avatarState?.()
    if (start) await handle.runtime.notifyAvatarChanged(start)
    if (program?.loadSoundpack) {
      try {
        await program.loadSoundpack()
        if (program.audioLocked?.()) {
          handle.activationRequired = true
          onStatus('Select the map to turn sound on')
        }
      } catch (error) {
        // A missing pack must not cancel the feature snapshot below.
        // eslint-disable-next-line no-console
        console.error('Audiom soundpack failed', error)
      }
    }
    const snapshot = await snapshotFeaturesFromMapView(jimuMapView, instanceId)
    await paintAudiomStyles(jimuMapView, snapshot)
    return handle.runtime.replaceSources(snapshot, 1)
  }).then((result) => {
    handle.appliedSources = result.revision
    onStatus(program ? 'Using the existing map' : handle.lastError)
  }).catch((error: unknown) => {
    handle.lastError = error instanceof Error ? error.message : 'Runtime failed'
    onStatus(handle.lastError)
  })
  return handle
}

export function bundledStatus (
  handle: BundledRuntimeHandle | null,
  waiting: boolean
): string {
  if (handle?.lastError) return handle.lastError
  if (waiting) return 'Waiting for the existing map'
  if (!handle) return 'Starting Audiom'
  return `Using the existing map (${handle.runtime.snapshot?.sources.length ?? 0} layers)`
}

export async function setBundledLifecycle (
  runtime: AudiomRuntime,
  opened: boolean
): Promise<void> {
  await runtime.setHostLifecycle(
    opened ? WidgetLifecycle.Opened : WidgetLifecycle.Closed,
    '2d',
    'anonymous'
  )
}

export const bundledFocusTarget = FocusTarget.Map
export const bundledSelection = SelectionOp.Replace

/**
 * Paint Audiom fill, stroke, width, opacity, dash, and pattern onto layers
 * already on the Esri map. No-op when the map has no styled features or the
 * symbol modules are absent. Host renderers are saved and restored on unmount.
 */
export async function paintAudiomStyles (
  jimuMapView: SnapshotMapView | undefined,
  snapshot?: MapSnapshot,
  mode: VectorStyleMode = 'both'
): Promise<void> {
  const layers = jimuMapView?.view?.map?.allLayers || jimuMapView?.map?.allLayers
  if (!layers || !snapshot) return
  let modules: SymbolModules
  try {
    const loaded = await import('jimu-core').then((jimu) =>
      jimu.loadArcGISJSAPIModules([
        'esri/symbols/SimpleFillSymbol',
        'esri/symbols/SimpleLineSymbol',
        'esri/symbols/SimpleMarkerSymbol',
        'esri/renderers/UniqueValueRenderer',
        'esri/symbols/PictureFillSymbol'
      ])
    ) as unknown[]
    modules = {
      SimpleFillSymbol: loaded[0] as SymbolModules['SimpleFillSymbol'],
      SimpleLineSymbol: loaded[1] as SymbolModules['SimpleLineSymbol'],
      SimpleMarkerSymbol: loaded[2] as SymbolModules['SimpleMarkerSymbol'],
      UniqueValueRenderer: loaded[3] as SymbolModules['UniqueValueRenderer'],
      PictureFillSymbol: loaded[4] as new (properties: unknown) => unknown
    }
  } catch {
    return
  }
  const queried = (snapshot as MapSnapshot & { queriedLayers?: SnapshotLayer[] }).queriedLayers || []
  layers.forEach((layer) => {
    const sourceId = layer.id || layer.title || 'layer'
    const match = queried.find((item) => (item.id || item.title || 'layer') === sourceId)
    const features = (match as (SnapshotLayer & { features?: Array<{ attributes?: Record<string, unknown> }> }) | undefined)?.features
    if (!features?.length) return
    applyAudiomSymbols(layer, modules, features, mode)
  })
}

/** Put each painted layer's host renderer back. */
export function restoreAudiomStyles (jimuMapView: SnapshotMapView | undefined): void {
  const layers = jimuMapView?.view?.map?.allLayers || jimuMapView?.map?.allLayers
  layers?.forEach((layer) => {
    restoreAudiomSymbols(layer as SymbolLayer)
  })
}

/** Resume Audiom's audio from a user gesture. False when no soundpack is loaded. */
export function unlockBundledAudio (handle: BundledRuntimeHandle | null | undefined): boolean {
  const unlocked = handle?.program?.unlockAudio?.() === true
  if (unlocked && handle) handle.activationRequired = false
  return unlocked
}
