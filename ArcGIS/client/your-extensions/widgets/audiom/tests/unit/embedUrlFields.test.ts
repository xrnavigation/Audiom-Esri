import { serializeReloadFields } from '../../src/utils/embedUrlFields'
import { IAudiomConfig, ISourceConfig } from '../../src/setting/configs'

const baseConfig = (): IAudiomConfig => ({
  apiKey: 'k',
  baseUrl: 'https://example.test',
  title: 'My Map',
  zoom: 10,
  centerLatitude: 1,
  centerLongitude: 2,
  sourceConfigs: [
    { source: 'parks', sourceUrl: 'https://x/parks', mapType: undefined, locked: true, enabled: true },
    { source: 'roads', sourceUrl: 'https://x/roads', mapType: undefined, locked: true, enabled: true }
  ] as ISourceConfig[],
  useExistingMap: true,
  existingMapId: 'm1',
  runtimeAutoSync: true
})

describe('serializeReloadFields', () => {
  it('is invariant to per-source `enabled` toggles on locked sources', () => {
    const a = baseConfig()
    const b = baseConfig()
    ;(b.sourceConfigs as ISourceConfig[])[0].enabled = false
    ;(b.sourceConfigs as ISourceConfig[])[1].enabled = false
    expect(serializeReloadFields(a)).toBe(serializeReloadFields(b))
  })

  it('is invariant to per-source `locked` flag (UI metadata only)', () => {
    const a = baseConfig()
    const b = baseConfig()
    ;(b.sourceConfigs as ISourceConfig[])[0].locked = false
    expect(serializeReloadFields(a)).toBe(serializeReloadFields(b))
  })

  it('changes when a source is added', () => {
    const a = baseConfig()
    const b = baseConfig()
    ;(b.sourceConfigs as ISourceConfig[]).push({
      source: 'new', sourceUrl: 'https://x/new', locked: true, enabled: true
    })
    expect(serializeReloadFields(a)).not.toBe(serializeReloadFields(b))
  })

  it('changes when a source is removed', () => {
    const a = baseConfig()
    const b = baseConfig()
    ;(b.sourceConfigs as ISourceConfig[]).pop()
    expect(serializeReloadFields(a)).not.toBe(serializeReloadFields(b))
  })

  it('changes when sourceUrl changes', () => {
    const a = baseConfig()
    const b = baseConfig()
    ;(b.sourceConfigs as ISourceConfig[])[0].sourceUrl = 'https://x/parks-v2'
    expect(serializeReloadFields(a)).not.toBe(serializeReloadFields(b))
  })

  it('changes when filters change', () => {
    const a = baseConfig()
    const b = baseConfig()
    ;(b.sourceConfigs as ISourceConfig[])[0].filters = [
      { field: 'x', operator: 'eq', value: '1' } as any
    ]
    expect(serializeReloadFields(a)).not.toBe(serializeReloadFields(b))
  })

  it('changes when center or zoom changes', () => {
    const a = baseConfig()
    const z = baseConfig(); z.zoom = 11
    const lat = baseConfig(); lat.centerLatitude = 99
    const lon = baseConfig(); lon.centerLongitude = 99
    expect(serializeReloadFields(a)).not.toBe(serializeReloadFields(z))
    expect(serializeReloadFields(a)).not.toBe(serializeReloadFields(lat))
    expect(serializeReloadFields(a)).not.toBe(serializeReloadFields(lon))
  })

  it('changes when useExistingMap or existingMapId changes', () => {
    const a = baseConfig()
    const b = baseConfig(); b.useExistingMap = false
    const c = baseConfig(); c.existingMapId = 'm2'
    expect(serializeReloadFields(a)).not.toBe(serializeReloadFields(b))
    expect(serializeReloadFields(a)).not.toBe(serializeReloadFields(c))
  })

  it('returns a deterministic string for equivalent configs', () => {
    expect(serializeReloadFields(baseConfig())).toBe(serializeReloadFields(baseConfig()))
  })
})
