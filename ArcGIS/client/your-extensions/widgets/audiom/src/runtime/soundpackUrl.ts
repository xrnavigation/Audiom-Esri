import { DEFAULT_ASSET_BASE_URL } from '../setting/runtimeLocation'

/** Names from Audiom's public/soundpacks.json. Do not fetch that file here. */
const PACK_LOCATIONS: Record<string, string> = {
  Outdoor: '/audio',
  Indoor: '/indoor',
  Minimal: '/default',
  Eclipse: '/eclipse_sounds',
  'Geological maps': '/gms',
  'Magical Bridge Playground': '/magicalbridge',
  'Wayfinding Centre': '/WayFindingCentre',
  'City of Boulder Playground': '/COBPlayground',
  'Zoning layers': '/zoning'
}

const DEFAULT_PACK = '/audio'
const DEFAULT_FALLBACK_PACK = '/default'

/**
 * A full soundpack address Audiom can fetch. An empty config uses the outdoor
 * pack on the asset host. A registry name becomes that pack's path. A relative
 * path is joined to the asset host so Experience Builder does not look for
 * the files on its own origin.
 */
export function resolveSoundpackUrl (
  configured: string | undefined,
  assetBaseUrl: string | undefined
): string {
  return resolvePackUrl(configured, assetBaseUrl)
}

/**
 * UI and route cues live in the sibling `/default` pack. Audiom otherwise
 * derives that fallback by appending `/default` to the primary URL, which
 * 404s (`/audio/default`). Return the real sibling so the caller can pass it
 * separately. Undefined when the selected pack already is that sibling.
 */
export function resolveSoundpackFallbackUrl (
  configured: string | undefined,
  assetBaseUrl: string | undefined
): string | undefined {
  const primary = resolvePackUrl(configured, assetBaseUrl)
  const fallback = resolvePackUrl(DEFAULT_FALLBACK_PACK, assetBaseUrl)
  return primary === fallback ? undefined : fallback
}

function resolvePackUrl (
  configured: string | undefined,
  assetBaseUrl: string | undefined
): string {
  const named = configured?.trim()
  const location = named ? (PACK_LOCATIONS[named] || named) : DEFAULT_PACK
  if (/^https?:\/\//i.test(location)) return location.replace(/\/$/, '')
  const base = (assetBaseUrl?.trim() || DEFAULT_ASSET_BASE_URL).replace(/\/$/, '')
  const path = location.startsWith('/') ? location : `/${location}`
  return `${base}${path}`
}
