import type { IconResult } from 'jimu-core'

/**
 * Experience Builder saves a custom widget by portal item id and drops its
 * uri. On the next open it builds the icon from that missing uri, so the
 * builder requests the missing-folder icon from its own CDN and draws an
 * empty square. The resolved uri is available once the item loads. Point the
 * icon at the published file beside that uri, and leave a chosen icon alone.
 */

export enum WidgetFolderFile {
  Icon = 'icon.svg',
  Manifest = 'manifest.json'
}

/** Experience Builder concatenates a missing folder URL into this file name. */
export const BROKEN_WIDGET_ICON = 'undefinedicon.svg'

const HTTPS_PREFIX = 'https://'
const HTTP_PREFIX = 'http://'
const HTTPS_SCHEME = 'https:'
const PROTOCOL_RELATIVE_PREFIX = '//'
/** JavaScript turns a missing folder URL into this token before adding the icon name. */
const MISSING_WIDGET_URI = 'undefined'
const FOLDER_SEPARATOR = '/'

export function publishedWidgetIconUrl (
  uri: string | null | undefined
): string | undefined {
  const folder = remoteWidgetFolder(uri)
  return folder ? `${folder}${WidgetFolderFile.Icon}` : undefined
}

export function repairedWidgetIcon (
  uri: string | null | undefined,
  icon: unknown
): string | undefined {
  const expected = publishedWidgetIconUrl(uri)
  if (!expected) return undefined
  const current = iconSvg(icon)
  if (current === expected) return undefined
  if (current == null || isBrokenWidgetIcon(current)) return expected
  return undefined
}

function remoteWidgetFolder (uri: string | null | undefined): string | undefined {
  if (!uri) return undefined
  const trimmed = uri.trim()
  if (!trimmed || trimmed.includes(MISSING_WIDGET_URI) || !isRemoteUrl(trimmed)) return undefined
  let folder = toHttps(trimmed)
  if (folder.endsWith(WidgetFolderFile.Manifest)) {
    folder = folder.slice(0, -WidgetFolderFile.Manifest.length)
  }
  return folder.endsWith(FOLDER_SEPARATOR) ? folder : `${folder}${FOLDER_SEPARATOR}`
}

function isRemoteUrl (uri: string): boolean {
  return uri.startsWith(HTTPS_PREFIX) ||
    uri.startsWith(HTTP_PREFIX) ||
    uri.startsWith(PROTOCOL_RELATIVE_PREFIX)
}

function toHttps (uri: string): string {
  if (uri.startsWith(PROTOCOL_RELATIVE_PREFIX)) {
    return `${HTTPS_SCHEME}${uri}`
  }
  if (uri.startsWith(HTTP_PREFIX)) {
    return `${HTTPS_PREFIX}${uri.slice(HTTP_PREFIX.length)}`
  }
  return uri
}

function iconSvg (icon: unknown): string | undefined {
  if (typeof icon === 'string') return icon
  if (isIconResult(icon)) return icon.svg
  return undefined
}

function isIconResult (icon: unknown): icon is IconResult {
  return typeof icon === 'object' && icon !== null && typeof (icon as IconResult).svg === 'string'
}

function isBrokenWidgetIcon (icon: string): boolean {
  return icon === BROKEN_WIDGET_ICON ||
    icon.endsWith(`${FOLDER_SEPARATOR}${BROKEN_WIDGET_ICON}`)
}
