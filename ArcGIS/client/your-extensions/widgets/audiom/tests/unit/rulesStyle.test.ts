import { applyConfiguredRules, resolveRulesFileUrl, rulesUrlForLayer, standingPitch } from '../../src/runtime/rulesStyle'

describe('rules file resolution', () => {
  it('resolves a root path against the Audiom origin, not the widget page', () => {
    expect(resolveRulesFileUrl('/rules/esri-indoor.json', [
      undefined,
      'http://localhost:3002',
      'https://audiom.net'
    ])).toBe('http://localhost:3002/rules/esri-indoor.json')
    expect(resolveRulesFileUrl('/rules/esri-indoor.json', [
      'https://audiom-staging.herokuapp.com/',
      'http://localhost:3002'
    ])).toBe('https://audiom-staging.herokuapp.com/rules/esri-indoor.json')
    expect(resolveRulesFileUrl('https://audiom.net/rules/esri-indoor.json', [
      'http://localhost:3002'
    ])).toBe('https://audiom.net/rules/esri-indoor.json')
  })

  it('matches a layer by service url when the Experience Builder id differs', () => {
    const url = rulesUrlForLayer({
      id: 'webmap-layer-9',
      title: 'Units',
      url: 'https://services.example/FeatureServer/1'
    }, [{
      id: 'source-layer-6',
      title: 'Units',
      url: 'https://services.example/FeatureServer/1',
      rulesFileUrl: 'http://localhost:3002/rules/esri-indoor.json'
    }])
    expect(url).toBe('http://localhost:3002/rules/esri-indoor.json')
  })

  it('stamps rule colors and drops excluded features', async () => {
    const layer = {
      id: 'units',
      title: 'Units',
      url: 'https://services.example/FeatureServer/1',
      geometryType: 'polygon',
      features: [
        { attributes: { OBJECTID: 1, USE_TYPE: 'Office', NAME: '201A' } },
        { attributes: { OBJECTID: 2, USE_TYPE: 'Level', NAME: 'Level 1' } }
      ]
    }
    await applyConfiguredRules([layer], [{
      url: layer.url,
      rulesFileUrl: 'http://localhost:3002/rules/esri-indoor.json'
    }], {
      loadRules: async () => ({ version: 2, rules: [] }),
      applyRules: (rules, attributes) => attributes.map((item) => (
        item.USE_TYPE === 'Office'
          ? { ...item, fill: '#e7ecef', stroke: '#6c757d', 'fill-pattern': 'dot-pattern', ruleName: 'Office', ruleType: 'office' }
          : null
      ))
    })
    expect(layer.rulesRef).toBe('http://localhost:3002/rules/esri-indoor.json')
    expect(layer.features).toHaveLength(1)
    expect(layer.features[0].attributes.fill).toBe('#e7ecef')
    expect(layer.features[0].attributes.OBJECTID).toBe(1)
    expect(layer.features[0].attributes['fill-pattern']).toBe('dot-pattern')
  })

  it('keeps the painted statistic when census rules only name the tract', () => {
    const place = { name: 'Census Tract 201', ruleName: 'Census Tract 201', ruleType: 'geographic' }
    expect(standingPitch(3006, place, true)).toBe(3006)
    expect(standingPitch(undefined, place, true)).toBeUndefined()
    expect(standingPitch(12, { name: 'RR', ruleName: 'Restroom', ruleType: 'restroom' }, false)).toBeUndefined()
  })

  it('keeps geometry that is not an own enumerable property', async () => {
    const rings = [[[-157.9, 21.3], [-157.8, 21.3], [-157.8, 21.4], [-157.9, 21.3]]]
    const graphic = { attributes: { OBJECTID: 1, NAME: 'Census Tract 201', State: 'Hawaii' } }
    Object.defineProperty(graphic, 'geometry', {
      enumerable: false,
      value: { rings }
    })
    const layer = {
      id: 'tracts',
      title: 'Tract',
      geometryType: 'polygon',
      features: [graphic]
    }
    await applyConfiguredRules([layer], [{
      id: 'tracts',
      rulesFileUrl: 'https://audiom-staging.herokuapp.com/rules/census.json'
    }], {
      loadRules: async () => ({ version: 2, rules: [] }),
      applyRules: (_rules, attributes) => attributes.map((item) => ({
        ...item,
        ruleName: item.NAME,
        ruleType: 'geographic',
        name: item.NAME
      }))
    })
    expect(layer.features[0].geometry).toEqual({ rings })
    expect(layer.features[0].attributes.ruleType).toBe('geographic')
  })
})
