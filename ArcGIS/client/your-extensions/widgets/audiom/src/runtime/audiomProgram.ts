/**
 * Compiled entry for the bundled Audiom program.
 *
 * Experience Builder compiles this file with the widget. The program is the
 * Front-End RuntimeSession (real MapWorld + Avatar). This file does not load
 * a script tag and does not invent movement.
 *
 * The Front-End program is audiom-front-end/runtime/exbEntry. The webpack
 * overlay resolves that id. It is a dynamic import so the widget file itself
 * stays small; inlining it froze the builder tab while the widget loaded.
 * The published build inlines that import. Tests supply a program through
 * setAudiomProgram.
 */
import type { AvatarState, RuntimeHost } from '../../../../shared/audiom-runtime/src/types'
import type { InProcessRuntime } from '../../../../shared/audiom-runtime/src/factory'

export interface AudiomProgramOptions {
  instanceId: string
  longitude?: number
  latitude?: number
  zoom?: number
  /** Meters. Passed to Audiom as Avatar.moveDistance. */
  moveDistance?: number
  /** Audiom soundpack address. Absent means Audiom stays silent. */
  soundpackUrl?: string
  /**
   * Sibling pack for cues the primary pack does not ship, usually `/default`.
   * Passed separately so Audiom does not invent `{primary}/default`.
   */
  soundpackFallbackUrl?: string
}

export interface AudiomProgram {
  readonly runtime: InProcessRuntime
  /** The compiled session, when the program is a RuntimeSession. */
  readonly world?: unknown
  /** Audiom's current avatar. Present as soon as the program exists. */
  avatarState?(): AvatarState
  moveAvatar(direction: string): AvatarState
  /**
   * Drop the indicator at a longitude and latitude. Null when Audiom
   * blocked the move, same as a marker drop against a wall.
   */
  dropAvatar?(longitude: number, latitude: number): AvatarState | null
  /**
   * Place the indicator at a new map source's center. Not a user drop:
   * no fence, no landing tone.
   */
  placeAt?(longitude: number, latitude: number): AvatarState
  /**
   * Apply a settings step size in meters. Must not restart the session:
   * a restart drops the avatar and re-queries the snapshot.
   */
  setMoveDistance?(meters: number): void
  /**
   * Fence navigation to the drawn map. The feature bbox is only a page.
   * A map switch publishes the new view extent here instead of rebuilding
   * the session.
   */
  setNavigationExtent?(extent: [number, number, number, number]): void
  /**
   * Speak the lines the map tooltip already shows: name, then statistic.
   * Null means the hit test found no painted plot.
   * Optional so a stub program that only drops the avatar still type-checks.
   */
  announceStanding?(
    title: string | null,
    statistic?: unknown,
    place?: Record<string, unknown> | null
  ): void
  /**
   * A painted hit-test has started. Restart the landing wait so it does
   * not play the hallway, or the empty swoosh, before that room arrives.
   */
  expectPaintedHit?(): void
  /** True when Audiom has a soundpack the browser has not unlocked. */
  audioLocked?(): boolean
  /**
   * Start the browser resume inside the user gesture. Must be synchronous:
   * awaiting unlockAudio() before this runs leaves Chrome's audio context
   * suspended, so the step tone is decoded and then played into silence.
   */
  primeAudio?(): void
  /**
   * Resume Audiom's audio context from a user gesture.
   * The compiled session returns a Promise. A sync true is also accepted.
   */
  unlockAudio?(): boolean | Promise<boolean>
  /** Load Audiom's soundpack. No-op when none was configured. */
  loadSoundpack?(): Promise<void>
  dispose(): void
}

export type AudiomProgramFactory = (
  options: AudiomProgramOptions,
  host: RuntimeHost
) => AudiomProgram

let programFactory: AudiomProgramFactory | null = null
let loadError = ''

export function setAudiomProgram (factory: AudiomProgramFactory | null): void {
  programFactory = factory
  loadError = ''
}

export function audiomProgramError (): string {
  return loadError
}

export interface AudiomCompiledEntry {
  createRuntimeSession?: AudiomProgramFactory
  popupContentAt?: (world: unknown, longitude: number, latitude: number) => string[]
  applyRulesToFeatures?: (
    rules: unknown,
    attributes: Array<Record<string, unknown>>,
    geometryType?: string
  ) => Array<Record<string, unknown> | null>
  mountAudiomEmbed?: (
    container: HTMLElement,
    options: {
      session: { world: unknown } | null
      view: unknown
      project: unknown
      controllerOptions: { welcome: false }
      showMapControls?: boolean
    }
  ) => { release: () => void }
  setEmbedMapControls?: (container: HTMLElement, show: boolean) => void
  unmountAudiomEmbed?: (container: HTMLElement) => void
}

let compiledEntry: AudiomCompiledEntry | null = null
let compiledEntryPromise: Promise<AudiomCompiledEntry | null> | null = null

/** The entry, once its chunk has loaded. Null before that, and in tests. */
export function compiledAudiomEntry (): AudiomCompiledEntry | null {
  return compiledEntry
}

/**
 * Load the Front-End program chunk. A static require put that program in
 * the widget file, and parsing it froze the tab. Tests set a factory and
 * must not fetch the chunk.
 */
export function loadAudiomEntry (): Promise<AudiomCompiledEntry | null> {
  if (compiledEntry) return Promise.resolve(compiledEntry)
  if (programFactory) return Promise.resolve(null)
  if (!compiledEntryPromise) {
    compiledEntryPromise = import(
      /* webpackChunkName: "audiom-program" */
      'audiom-front-end/runtime/exbEntry'
    ).then((compiled: AudiomCompiledEntry) => {
      compiledEntry = compiled
      if (!programFactory && compiled.createRuntimeSession) {
        programFactory = compiled.createRuntimeSession
      }
      return compiled
    }).catch((error: unknown): null => {
      loadError = error instanceof Error ? error.message : 'Audiom program failed to load'
      // eslint-disable-next-line no-console
      console.error('Audiom program failed to load', error)
      compiledEntryPromise = null
      return null
    })
  }
  return compiledEntryPromise
}

function loadCompiledProgram (): AudiomProgramFactory | null {
  return programFactory
}

/** The real Audiom program, compiled into the widget. Null only when it is absent. */
export function createAudiomProgram (
  options: AudiomProgramOptions,
  host: RuntimeHost
): AudiomProgram | null {
  const factory = loadCompiledProgram()
  return factory ? factory(options, host) : null
}

