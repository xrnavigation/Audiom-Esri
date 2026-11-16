// Webpack aliases this id onto the Front-End checkout. It is not a package.
declare module 'audiom-front-end/runtime/exbEntry' {
  import type { AudiomCompiledEntry } from './audiomProgram'

  export const createRuntimeSession: AudiomCompiledEntry['createRuntimeSession']
  export const popupContentAt: AudiomCompiledEntry['popupContentAt']
  export const applyRulesToFeatures: AudiomCompiledEntry['applyRulesToFeatures']
  export const mountAudiomEmbed: AudiomCompiledEntry['mountAudiomEmbed']
  export const setEmbedMapControls: AudiomCompiledEntry['setEmbedMapControls']
  export const unmountAudiomEmbed: AudiomCompiledEntry['unmountAudiomEmbed']
}
