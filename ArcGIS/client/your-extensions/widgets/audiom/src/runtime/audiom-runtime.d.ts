/**
 * Experience Builder's tsconfig uses moduleResolution "node", which does not
 * read a package's `exports` map. These declarations point the runtime's
 * entries at the declaration files the package ships. Types only: webpack
 * resolves the entries through `exports`.
 */
declare module '@xrnavigation/audiom-runtime/contract' {
  export * from '@xrnavigation/audiom-runtime/dist/src/runtime/contract'
}

declare module '@xrnavigation/audiom-runtime/in-process' {
  export * from '@xrnavigation/audiom-runtime/dist/src/runtime/in-process'
}

declare module '@xrnavigation/audiom-runtime/labels' {
  export * from '@xrnavigation/audiom-runtime/dist/src/runtime/labels'
}

declare module '@xrnavigation/audiom-runtime/assets/locales/*' {
  const catalog: Record<string, unknown>
  export default catalog
}
