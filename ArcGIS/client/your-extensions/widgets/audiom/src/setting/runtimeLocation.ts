import { AudiomConfigKey } from './configKeys'
import type { IAudiomConfig } from './configs'

/** Where the Audiom runtime runs. Absent saved configs stay on the iframe. */
export enum RuntimeLocation {
  /** Saved configs from before Standalone embed was its own mode. */
  Legacy = 'legacy',
  Standalone = 'standalone',
  Bundled = 'bundled'
}

export const DEFAULT_RUNTIME_LOCATION = RuntimeLocation.Standalone
export const DEFAULT_API_ENDPOINT = 'https://audiom.net'
export const DEFAULT_ASSET_BASE_URL = 'https://audiom.net'

const MAP_SETTING_KEYS = [
  AudiomConfigKey.Zoom,
  AudiomConfigKey.CenterLatitude,
  AudiomConfigKey.CenterLongitude
]

const LEGACY_ONLY_KEYS: Array<keyof IAudiomConfig> = [
  AudiomConfigKey.ShowVisualMap,
  AudiomConfigKey.VisualStyle,
  AudiomConfigKey.VisualBaseLayers,
  AudiomConfigKey.BaseUrl
]

export function runtimeLocationOf (
  config: Partial<IAudiomConfig> | undefined
): RuntimeLocation {
  const value = config?.runtimeLocation
  if (
    value === RuntimeLocation.Standalone ||
    value === RuntimeLocation.Bundled ||
    value === RuntimeLocation.Legacy
  ) {
    return value
  }
  return DEFAULT_RUNTIME_LOCATION
}

/** Iframe embed, including configs saved before Standalone embed existed. */
export function isEmbedRuntime (location: RuntimeLocation): boolean {
  return location === RuntimeLocation.Standalone || location === RuntimeLocation.Legacy
}

export function isIntegratedRuntime (
  location: RuntimeLocation = DEFAULT_RUNTIME_LOCATION
): boolean {
  return !isEmbedRuntime(location)
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
  if (isEmbedRuntime(location)) {
    return [
      ...shared,
      AudiomConfigKey.BaseUrl,
      AudiomConfigKey.ShowVisualMap,
      AudiomConfigKey.VisualStyle,
      AudiomConfigKey.VisualBaseLayers,
      ...MAP_SETTING_KEYS
    ]
  }
  return [
    ...shared,
    AudiomConfigKey.MapItemId,
    ...MAP_SETTING_KEYS,
    AudiomConfigKey.ApiEndpoint,
    AudiomConfigKey.AssetBaseUrl
  ]
}

export function isSettingVisible (
  key: AudiomConfigKey,
  location: RuntimeLocation
): boolean {
  return visibleSettingKeys(location).includes(key)
}

/**
 * Values that do not apply to the current mode. They stay in the saved
 * config so switching back to standalone embed restores them.
 */
export function ignoredSettingKeys (
  config: Partial<IAudiomConfig> | undefined
): Array<keyof IAudiomConfig> {
  const location = runtimeLocationOf(config)
  if (isEmbedRuntime(location)) {
    return [AudiomConfigKey.ApiEndpoint, AudiomConfigKey.AssetBaseUrl]
      .filter((key) => config?.[key] !== undefined)
  }
  return LEGACY_ONLY_KEYS.filter((key) => config?.[key] !== undefined)
}
