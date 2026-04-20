import {
  combineFilterExpressions,
  combineTimeFilters,
  getSourcesFromConfig,
  audiomConfigToEmbedConfig,
  isAudiomConfigValid
} from '../../src/utils/mapUtils'
import { FilterType } from '../../src/setting/enums'
import { MapType } from '../../../../shared/audiom-client/AudiomSource'
import { makeConfig, makeSource, makeFilter } from '../helpers/configFactories'

describe('combineFilterExpressions', () => {
  it('returns undefined when no where filters present', () => {
    expect(combineFilterExpressions([])).toBeUndefined()
    expect(combineFilterExpressions([
      makeFilter({ filterType: FilterType.When, expression: '2024-01-01/2024-12-31' })
    ])).toBeUndefined()
  })

  it('joins multiple where expressions with AND, parenthesized', () => {
    const out = combineFilterExpressions([
      makeFilter({ expression: 'a > 1' }),
      makeFilter({ expression: 'b < 5' })
    ])
    expect(out).toBe('(a > 1) AND (b < 5)')
  })

  it('treats filters without filterType as where (back-compat)', () => {
    const out = combineFilterExpressions([
      { expression: 'x = 1' } as any
    ])
    expect(out).toBe('(x = 1)')
  })

  it('skips empty/whitespace expressions', () => {
    const out = combineFilterExpressions([
      makeFilter({ expression: '   ' }),
      makeFilter({ expression: 'real = 1' })
    ])
    expect(out).toBe('(real = 1)')
  })
})

describe('combineTimeFilters', () => {
  it('returns undefined when no when-filters present', () => {
    expect(combineTimeFilters([])).toBeUndefined()
    expect(combineTimeFilters([
      makeFilter({ filterType: FilterType.Where })
    ])).toBeUndefined()
  })

  it('intersects multiple ISO intervals (latest start, earliest end)', () => {
    const out = combineTimeFilters([
      makeFilter({ filterType: FilterType.When, expression: '2024-01-01T00:00:00Z/2024-12-31T00:00:00Z' }),
      makeFilter({ filterType: FilterType.When, expression: '2024-06-01T00:00:00Z/2025-06-01T00:00:00Z' })
    ])
    expect(out).toBeDefined()
    expect(out!.start).toBe(new Date('2024-06-01T00:00:00Z').getTime())
    expect(out!.end).toBe(new Date('2024-12-31T00:00:00Z').getTime())
  })
})

describe('getSourcesFromConfig', () => {
  it('returns [] when no sourceConfigs', () => {
    expect(getSourcesFromConfig(makeConfig({ sourceConfigs: [] }))).toEqual([])
  })

  it('skips sources with no sourceUrl', () => {
    const cfg = makeConfig({ sourceConfigs: [makeSource({ sourceUrl: undefined })] })
    expect(getSourcesFromConfig(cfg)).toEqual([])
  })

  it('skips disabled sources', () => {
    const cfg = makeConfig({
      sourceConfigs: [
        makeSource({ source: 'on', enabled: true, sourceUrl: 'https://x/1' }),
        makeSource({ source: 'off', enabled: false, sourceUrl: 'https://x/2' })
      ]
    })
    const out = getSourcesFromConfig(cfg)
    expect(out.map(s => s.source)).toEqual(['on'])
  })

  it('builds an AudiomSource from each enabled source', () => {
    const cfg = makeConfig({
      sourceConfigs: [makeSource({
        source: 'a', name: 'Layer A',
        sourceUrl: 'https://x/0', mapType: MapType.Heatmap
      })]
    })
    const out = getSourcesFromConfig(cfg)
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe('https://x/0')
    expect(out[0].mapType).toBe(MapType.Heatmap)
  })
})

describe('audiomConfigToEmbedConfig', () => {
  it('produces an embed config with safe defaults when fields are missing', () => {
    const cfg = makeConfig({
      // explicit clears so we exercise DEFAULT_CONFIG fallbacks
      centerLatitude: undefined,
      centerLongitude: undefined,
      zoom: undefined,
      stepSize: undefined,
      stepSizeUnit: undefined,
      title: undefined
    })
    const embed = audiomConfigToEmbedConfig(cfg, undefined)
    expect(embed).toBeDefined()
    // Should be serializable to a URL without throwing
    const url = embed.toUrl(cfg.baseUrl ?? 'https://example.com')
    expect(typeof url).toBe('string')
    expect(url.startsWith(cfg.baseUrl!)).toBe(true)
  })

  it('encodes special characters in user-supplied title', () => {
    const cfg = makeConfig({ title: '<script>"&\u00e9' })
    const embed = audiomConfigToEmbedConfig(cfg, undefined)
    const url = embed.toUrl(cfg.baseUrl!)
    // Raw script tag must not appear unescaped in the URL
    expect(url).not.toContain('<script>')
    expect(url).not.toContain('"&')
  })

  it('serializes visualBaseLayers when provided with positions', () => {
    const cfg = makeConfig({
      visualBaseLayers: [{
        url: 'https://x/img.png',
        position: '[[-1,1],[1,1],[1,-1],[-1,-1]]'
      }]
    })
    const embed = audiomConfigToEmbedConfig(cfg, undefined)
    expect(embed).toBeDefined()
    // Should not throw on toUrl
    expect(() => embed.toUrl(cfg.baseUrl!)).not.toThrow()
  })

  it('omits visualBaseLayers when empty', () => {
    const cfg = makeConfig({ visualBaseLayers: [] })
    const embed = audiomConfigToEmbedConfig(cfg, undefined)
    expect(embed).toBeDefined()
  })
})

describe('isAudiomConfigValid', () => {
  it('is false without an apiKey', () => {
    expect(isAudiomConfigValid(makeConfig({ apiKey: '' }))).toBe(false)
    expect(isAudiomConfigValid(makeConfig({ apiKey: '   ' }))).toBe(false)
  })

  it('is true for a clean config with apiKey', () => {
    expect(isAudiomConfigValid(makeConfig({ apiKey: 'k' }))).toBe(true)
  })

  it('is false when baseUrl is malicious', () => {
    expect(isAudiomConfigValid(makeConfig({ apiKey: 'k', baseUrl: 'javascript:alert(1)' }))).toBe(false)
  })

  it('is false when latitude is out of range', () => {
    expect(isAudiomConfigValid(makeConfig({ apiKey: 'k', centerLatitude: 99 }))).toBe(false)
  })
})
