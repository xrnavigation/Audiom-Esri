import {
  combineFilterExpressions,
  combineTimeFilters,
  getSourcesFromConfig,
  audiomConfigToEmbedConfig,
  isAudiomConfigValid
} from '../../src/utils/mapUtils'
import { FilterType } from '../../src/setting/enums'
import { MapType, SourceType } from '../../../../shared/audiom-client/AudiomSource'
import { VisualBaseLayerType } from '../../../../shared/audiom-client/AudiomEmbedConfig'
import { toMutableConfig } from '../../src/setting/configs'
import { makeConfig, makeImmutableConfig, makeSource, makeFilter } from '../helpers/configFactories'

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
    const params = embed.toQueryParams()
    expect(params.visualbaselayer0).toBe('https://x/img.png')
    expect(params.visualbaselayerposition0).toBe('[[-1,1],[1,1],[1,-1],[-1,-1]]')
    expect(params.visualbaselayerposition0).not.toContain('[object Object]')
  })

  it('serializes Immutable visualBaseLayer positions as JSON after a deep copy', () => {
    const cfg = toMutableConfig(makeImmutableConfig({
      visualBaseLayers: [{
        url: 'https://x/img.png',
        position: '[[-92.9,47.1],[-86.6,47.1],[-86.6,42.4],[-92.9,42.4]]'
      }]
    }))
    const embed = audiomConfigToEmbedConfig(cfg, undefined)
    const params = embed.toQueryParams()
    expect(params.visualbaselayerposition0).toBe('[[-92.9,47.1],[-86.6,47.1],[-86.6,42.4],[-92.9,42.4]]')
    expect(params.visualbaselayerposition0).not.toBe('[object Object]')
  })

  it('omits visualBaseLayers when empty', () => {
    const cfg = makeConfig({ visualBaseLayers: [] })
    const embed = audiomConfigToEmbedConfig(cfg, undefined)
    expect(embed).toBeDefined()
  })

  it('serializes feature visual base layers as esri sources', () => {
    const featureUrl = 'https://services.arcgis.com/example/FeatureServer/0'
    const cfg = makeConfig({
      visualBaseLayers: [{
        url: featureUrl,
        type: VisualBaseLayerType.Feature,
        position: '[[-1,1],[1,1],[1,-1],[-1,-1]]'
      }]
    })
    const params = audiomConfigToEmbedConfig(cfg, undefined).toQueryParams()
    expect(params.sources).toBe('visualbaselayer0')
    expect(params['visualbaselayer0.type']).toBe(SourceType.ESRI)
    expect(params['visualbaselayer0.url']).toBe(featureUrl)
    expect(params.visualbaselayer0).toBeUndefined()
    expect(params.visualbaselayerposition0).toBeUndefined()
  })

  it('serializes a custom visual base layer name', () => {
    const cfg = makeConfig({
      visualBaseLayers: [{
        url: 'https://x/img.png',
        layerName: ' Campus overlay ',
        type: VisualBaseLayerType.Image
      }]
    })
    const params = audiomConfigToEmbedConfig(cfg, undefined).toQueryParams()
    expect(params.visualbaselayername0).toBe('Campus overlay')
  })

  it('uses a custom feature layer name instead of the URL segment', () => {
    const cfg = makeConfig({
      visualBaseLayers: [{
        url: 'https://services.arcgis.com/example/FeatureServer/0',
        layerName: 'Buildings',
        type: VisualBaseLayerType.Feature
      }]
    })
    const params = audiomConfigToEmbedConfig(cfg, undefined).toQueryParams()
    expect(params['visualbaselayer0.name']).toBe('Buildings')
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
