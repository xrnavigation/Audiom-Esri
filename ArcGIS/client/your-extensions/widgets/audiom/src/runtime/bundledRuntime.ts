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
import { snapshotFromMapView, type SnapshotMapView } from './mapSnapshot'
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
}

const applied = (revision = 0): AppliedResult => ({ applied: true, revision })

/** Runs the runtime package in this widget. The Esri map stays the map. */
export function startBundledRuntime (
  instanceId: string,
  jimuMapView: SnapshotMapView | undefined,
  onStatus: (status: string) => void,
  surface: MountedMapSurface | null = null,
  origin?: { longitude?: number, latitude?: number, moveDistance?: number }
): BundledRuntimeHandle {
  const handle: BundledRuntimeHandle = {
    runtime: null as unknown as InProcessRuntime,
    appliedSources: 0,
    lastError: '',
    avatar: null,
    reported: false
  }
  let program: AudiomProgram | null = null
  const host = {
    onAvatarChanged (state: AvatarState) {
      handle.avatar = state
      handle.reported = true
      handle.onReported?.(state)
      void showAvatar(surface, {
        longitude: state.position.longitude,
        latitude: state.position.latitude,
        heading: state.orientation
      })
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
    onActivationRequired () { return Promise.resolve(applied()) },
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
  program = createAudiomProgram({
    instanceId,
    longitude: origin?.longitude,
    latitude: origin?.latitude,
    moveDistance: origin?.moveDistance
  }, host)
  if (program) {
    handle.runtime = program.runtime
  } else {
    handle.lastError = audiomProgramError() || 'Audiom program failed to load'
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
    return handle.runtime.replaceSources(
      snapshotFromMapView(jimuMapView, instanceId),
      1
    )
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
