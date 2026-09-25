import { AudiomConfigKey } from '../../src/setting/configKeys'
import {
  hostedOriginDisclosure,
  isSettingVisible,
  RuntimeLocation
} from '../../src/setting/runtimeLocation'

describe('runtime location field visibility', () => {
  const hiddenInIntegrated = [
    AudiomConfigKey.ShowVisualMap,
    AudiomConfigKey.VisualStyle,
    AudiomConfigKey.VisualBaseLayers,
    AudiomConfigKey.Zoom,
    AudiomConfigKey.CenterLatitude
  ]

  it.each([RuntimeLocation.Bundled, RuntimeLocation.Hosted])(
    'hides the standalone visual fields in %s mode',
    (location) => {
      for (const key of hiddenInIntegrated) {
        expect(isSettingVisible(key, location)).toBe(false)
      }
      expect(isSettingVisible(AudiomConfigKey.ApiKey, location)).toBe(true)
      expect(isSettingVisible(AudiomConfigKey.Title, location)).toBe(true)
      expect(isSettingVisible(AudiomConfigKey.ShowHeading, location)).toBe(true)
      expect(isSettingVisible(AudiomConfigKey.ExistingMapId, location)).toBe(true)
    }
  )

  it('shows the embed URL only in legacy and hosted modes', () => {
    expect(isSettingVisible(AudiomConfigKey.BaseUrl, RuntimeLocation.Legacy)).toBe(true)
    expect(isSettingVisible(AudiomConfigKey.BaseUrl, RuntimeLocation.Hosted)).toBe(true)
    expect(isSettingVisible(AudiomConfigKey.BaseUrl, RuntimeLocation.Bundled)).toBe(false)
  })

  it('shows the bundled endpoints only in bundled mode', () => {
    expect(isSettingVisible(AudiomConfigKey.ApiEndpoint, RuntimeLocation.Bundled)).toBe(true)
    expect(isSettingVisible(AudiomConfigKey.AssetBaseUrl, RuntimeLocation.Bundled)).toBe(true)
    expect(isSettingVisible(AudiomConfigKey.ApiEndpoint, RuntimeLocation.Hosted)).toBe(false)
  })

  it('announces the hosted origin', () => {
    expect(hostedOriginDisclosure('https://audiom.net/runtime/hosted'))
      .toBe("The map's records are rendered inside https://audiom.net.")
  })
})
