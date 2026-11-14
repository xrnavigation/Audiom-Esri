const ASSET_FOLDERS = {
  sounds: 'sounds',
  icons: 'icons'
} as const

export type RuntimeAssetKind = keyof typeof ASSET_FOLDERS

/**
 * Asset URL under this widget's deployed folder. Experience Builder copies
 * widgets/audiom/assets with the widget, so sounds and icons must not use
 * site-root paths such as /audio.
 */
export function runtimeAssetUrl (
  widgetFolderUrl: string,
  kind: RuntimeAssetKind,
  fileName = ''
): string {
  const base = widgetFolderUrl.replace(/\/$/, '')
  const folder = `${base}/assets/${ASSET_FOLDERS[kind]}`
  return fileName ? `${folder}/${fileName}` : `${folder}/`
}
