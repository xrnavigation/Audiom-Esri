/**
 * Compiled entry for the bundled Audiom program.
 *
 * Experience Builder compiles this file with the widget. The program is the
 * Front-End RuntimeSession (real MapWorld + Avatar). This file does not load
 * a script tag and does not invent movement.
 *
 * The Front-End package is a sibling repository. Tests and hosts that have
 * not installed it supply a program through setAudiomProgram.
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
}

export interface AudiomProgram {
  readonly runtime: InProcessRuntime
  /** Audiom's current avatar. Present as soon as the program exists. */
  avatarState?(): AvatarState
  moveAvatar(direction: string): AvatarState
  /** True when Audiom has a soundpack the browser has not unlocked. */
  audioLocked?(): boolean
  /** Resume Audiom's audio context from a user gesture. */
  unlockAudio?(): boolean
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

function loadCompiledProgram (): AudiomProgramFactory | null {
  if (programFactory) return programFactory
  try {
    // Experience Builder compiles this sibling file with the widget.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const compiled = require('../../../../../../../../Audiom-Front-End/src/runtime/exbEntry') as {
      createRuntimeSession: AudiomProgramFactory
    }
    programFactory = compiled.createRuntimeSession
    return programFactory
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Audiom program failed to load'
    return null
  }
}

/** The real Audiom program, compiled into the widget. Null only when it is absent. */
export function createAudiomProgram (
  options: AudiomProgramOptions,
  host: RuntimeHost
): AudiomProgram | null {
  const factory = loadCompiledProgram()
  return factory ? factory(options, host) : null
}
