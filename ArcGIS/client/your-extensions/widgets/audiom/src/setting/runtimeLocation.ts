import { AudiomConfigKey } from './configKeys'
import type { IAudiomConfig } from './configs'

/** Where the Audiom runtime runs. Absent saved configs stay on the iframe. */
export enum RuntimeLocation {
  Legacy = 'legacy',
  Bundled = 'bundled',
  Hosted = 'hosted'
}

export const DEFAULT_RUNTIME_LOCATION = RuntimeLocation.Legacy
export const DEFAULT_API_ENDPOINT = 'https://audiom.net'
export const DEFAULT_ASSET_BASE_URL = 'https://audiom.net'

const LEGACY_ONLY_KEYS: Array<keyof IAudiomConfig> = [
  AudiomConfigKey.ShowVisualMap,
  AudiomConfigKey.VisualStyle,
  AudiomConfigKey.VisualBaseLayers,
  AudiomConfigKey.Zoom,
  AudiomConfigKey.CenterLatitude,
  AudiomConfigKey.CenterLongitude,
  AudiomConfigKey.BaseUrl
]

export function runtimeLocationOf (
  config: Partial<IAudiomConfig> | undefined
): RuntimeLocation {
  const value = config?.runtimeLocation
  if (value === RuntimeLocation.Bundled || value === RuntimeLocation.Hosted) {
    return value
  }
  return DEFAULT_RUNTIME_LOCATION
}

export function isIntegratedRuntime (
  location: RuntimeLocation = DEFAULT_RUNTIME_LOCATION
): boolean {
  return location !== RuntimeLocation.Legacy
}

/** Fields the Connection and Display sections should render for this mode. */
export function visibleSettingKeys (location: RuntimeLocation): AudiomConfigKey[] {
  const shared = [
    AudiomConfigKey.ApiKey,
    AudiomConfigKey.SoundpackUrl,
    AudiomConfigKey.Title,
    AudiomConfigKey.ShowHeading,
    AudiomConfigKey.Heading,
    AudiomConfigKey.StepSize
  ]
  if (location === RuntimeLocation.Legacy) {
    return [
      ...shared,
      AudiomConfigKey.BaseUrl,
      AudiomConfigKey.ShowVisualMap,
      AudiomConfigKey.VisualStyle,
      AudiomConfigKey.VisualBaseLayers,
      AudiomConfigKey.Zoom,
      AudiomConfigKey.CenterLatitude,
      AudiomConfigKey.CenterLongitude
    ]
  }
  const integrated = [...shared, AudiomConfigKey.ExistingMapId]
  if (location === RuntimeLocation.Bundled) {
    return [
      ...integrated,
      AudiomConfigKey.ApiEndpoint,
      AudiomConfigKey.AssetBaseUrl
    ]
  }
  return [...integrated, AudiomConfigKey.BaseUrl]
}

export function isSettingVisible (
  key: AudiomConfigKey,
  location: RuntimeLocation
): boolean {
  return visibleSettingKeys(location).includes(key)
}

/**
 * Values that do not apply to the current mode. They stay in the saved
 * config so switching back to legacy restores them.
 */
export function ignoredSettingKeys (
  config: Partial<IAudiomConfig> | undefined
): Array<keyof IAudiomConfig> {
  const location = runtimeLocationOf(config)
  if (location === RuntimeLocation.Legacy) {
    return [AudiomConfigKey.ApiEndpoint, AudiomConfigKey.AssetBaseUrl]
      .filter((key) => config?.[key] !== undefined)
  }
  return LEGACY_ONLY_KEYS.filter((key) => {
    if (location === RuntimeLocation.Hosted && key === AudiomConfigKey.BaseUrl) {
      return false
    }
    return config?.[key] !== undefined
  })
}

export function hostedOriginDisclosure (baseUrl: string | undefined): string {
  let origin = baseUrl || DEFAULT_API_ENDPOINT
  try {
    origin = new URL(origin).origin
  } catch {
    origin = baseUrl || DEFAULT_API_ENDPOINT
  }
  return `The map's records are rendered inside ${origin}.`
}
