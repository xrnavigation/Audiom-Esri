import { AudiomConfigKey } from '../../src/setting/configKeys'
import {
  isSettingVisible,
  RuntimeLocation
} from '../../src/setting/runtimeLocation'

describe('runtime location field visibility', () => {
  const hiddenInIntegrated = [
    AudiomConfigKey.ShowVisualMap,
    AudiomConfigKey.VisualStyle,
    AudiomConfigKey.VisualBaseLayers
  ]

  it.each([RuntimeLocation.Bundled])(
    'hides the standalone visual fields in %s mode',
    (location) => {
      for (const key of hiddenInIntegrated) {
        expect(isSettingVisible(key, location)).toBe(false)
      }
      expect(isSettingVisible(AudiomConfigKey.ApiKey, location)).toBe(true)
      expect(isSettingVisible(AudiomConfigKey.Title, location)).toBe(true)
      expect(isSettingVisible(AudiomConfigKey.ShowHeading, location)).toBe(true)
      expect(isSettingVisible(AudiomConfigKey.ExistingMapId, location)).toBe(false)
      expect(isSettingVisible(AudiomConfigKey.MapItemId, location)).toBe(true)
    }
  )

  it('shows the embed URL only in standalone embed mode', () => {
    expect(isSettingVisible(AudiomConfigKey.BaseUrl, RuntimeLocation.Standalone)).toBe(true)
    expect(isSettingVisible(AudiomConfigKey.BaseUrl, RuntimeLocation.Legacy)).toBe(true)
    expect(isSettingVisible(AudiomConfigKey.BaseUrl, RuntimeLocation.Bundled)).toBe(false)
  })

  it('shows map settings in bundled mode', () => {
    expect(isSettingVisible(AudiomConfigKey.Zoom, RuntimeLocation.Bundled)).toBe(true)
    expect(isSettingVisible(AudiomConfigKey.CenterLatitude, RuntimeLocation.Bundled)).toBe(true)
    expect(isSettingVisible(AudiomConfigKey.CenterLongitude, RuntimeLocation.Bundled)).toBe(true)
  })

  it('shows the bundled endpoints only in bundled mode', () => {
    expect(isSettingVisible(AudiomConfigKey.ApiEndpoint, RuntimeLocation.Bundled)).toBe(true)
    expect(isSettingVisible(AudiomConfigKey.AssetBaseUrl, RuntimeLocation.Bundled)).toBe(true)
    expect(isSettingVisible(AudiomConfigKey.ApiEndpoint, RuntimeLocation.Standalone)).toBe(false)
  })
})
