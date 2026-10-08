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
  const named = configured?.trim()
  const location = named ? (PACK_LOCATIONS[named] || named) : DEFAULT_PACK
  if (/^https?:\/\//i.test(location)) return location.replace(/\/$/, '')
  const base = (assetBaseUrl?.trim() || DEFAULT_ASSET_BASE_URL).replace(/\/$/, '')
  const path = location.startsWith('/') ? location : `/${location}`
  return `${base}${path}`
}
