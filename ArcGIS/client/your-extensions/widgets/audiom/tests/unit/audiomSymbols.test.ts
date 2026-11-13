import { applyAudiomLabels, applyAudiomSymbols, colorWithOpacity, heatmapField, labelExpression, labelFieldsOf, LABEL_MIN_SCALE, restoreAudiomLabels, restoreAudiomSymbols, styleKey, symbolFor, patternTileUrl, VectorStyleMode } from '../../src/runtime/audiomSymbols'

class FakeSymbol {
  properties: unknown
  constructor (properties: unknown) {
    this.properties = properties
  }
}

const modules = {
  SimpleFillSymbol: FakeSymbol,
  SimpleLineSymbol: FakeSymbol,
  SimpleMarkerSymbol: FakeSymbol,
  UniqueValueRenderer: FakeSymbol,
  ClassBreaksRenderer: FakeSymbol,
  PictureFillSymbol: FakeSymbol
}

describe('audiom symbols', () => {
  it('folds opacity into an Esri color and leaves opaque hex alone', () => {
    expect(colorWithOpacity('#7bbf75', 1)).toBe('#7bbf75')
    expect(colorWithOpacity('#7bbf75', 0.5)).toEqual([123, 191, 117, 128])
  })

  it('hashes every visual key so width and dash are distinct styles', () => {
    const base = { fill: '#7bbf75', stroke: '#04203e' }
    expect(styleKey(base)).not.toBe(styleKey({ ...base, 'stroke-width': 4 }))
    expect(styleKey(base)).not.toBe(styleKey({ ...base, 'stroke-dasharray': '4,3' }))
    expect(styleKey(base)).not.toBe(styleKey({ ...base, 'fill-opacity': 0.4 }))
    expect(styleKey(base)).not.toBe(styleKey({ ...base, 'fill-pattern': 'grid-pattern' }))
  })

  it('compiles width, opacity, dash, and the canonical pattern bitmap', () => {
    const line = symbolFor(modules, 'polyline', {
      stroke: '#04203e',
      'stroke-width': 4,
      'stroke-dasharray': '4,3'
    }) as FakeSymbol
    expect(line.properties).toMatchObject({ color: '#04203e', width: 4, style: 'dash' })

    const fill = symbolFor(modules, 'polygon', {
      fill: '#7bbf75',
      'fill-opacity': 0.5,
      stroke: '#04203e',
      'stroke-width': 2
    }) as FakeSymbol
    expect(fill.properties).toMatchObject({
      color: [123, 191, 117, 128],
      style: 'solid'
    })

    const patterned = symbolFor(modules, 'polygon', {
      fill: '#7bbf75',
      'fill-pattern': 'caret-pattern',
      stroke: '#04203e'
    }) as FakeSymbol
    expect(patterned.properties).toMatchObject({
      url: patternTileUrl('caret-pattern', 16, '#7bbf75'),
      width: 16,
      height: 16
    })
    expect(String((patterned.properties as { url: string }).url)).toContain('svg')
  })

  it('suppresses fill color in patterns mode and skips none/hidden', () => {
    const patterned = symbolFor(modules, 'polygon', {
      fill: '#ff0000',
      'fill-pattern': 'dot-pattern'
    }, VectorStyleMode.Patterns) as FakeSymbol
    expect((patterned.properties as { url?: string }).url).toBe(patternTileUrl('dot-pattern'))
    expect((patterned.properties as { color?: string }).color).toBeUndefined()
    expect(symbolFor(modules, 'polygon', { fill: '#ff0000' }, VectorStyleMode.None)).toBeNull()
    expect(symbolFor(modules, 'polygon', { fill: '#ff0000' }, VectorStyleMode.Hidden)).toBeNull()
  })

  it('saves the host renderer and restores it', () => {
    const host = { kind: 'host' }
    const layer = {
      geometryType: 'polygon',
      renderer: host,
      features: [{ attributes: { fill: '#7bbf75', 'stroke-width': 3, OBJECTID: 1 } }]
    }
    expect(applyAudiomSymbols(layer, modules, layer.features)).toBe(true)
    expect(layer.renderer).not.toBe(host)
    const painted = layer.renderer as unknown as FakeSymbol
    expect(String((painted.properties as { valueExpression?: string }).valueExpression)).toContain('OBJECTID')
    expect(String((painted.properties as { valueExpression?: string }).valueExpression)).toContain('#7bbf75')
    expect(restoreAudiomSymbols(layer)).toBe(true)
    expect(layer.renderer).toBe(host)
    expect(restoreAudiomSymbols(layer)).toBe(false)
  })

  it('paints a varying numeric field with class breaks instead of an object-id expression', () => {
    const host = { kind: 'host', type: 'simple' }
    const features = [1, 2, 3, 4, 5].map((value) => ({
      attributes: { OBJECTID: value, percent: value * 10 }
    }))
    const layer = { geometryType: 'polygon', objectIdField: 'OBJECTID', renderer: host, features }
    expect(heatmapField(features)?.field).toBe('percent')
    expect(applyAudiomSymbols(layer, modules, features, VectorStyleMode.Both)).toBe(true)
    expect(layer.renderer).not.toBe(host)
    const painted = layer.renderer as unknown as FakeSymbol
    const properties = painted.properties as {
      field?: string
      valueExpression?: string
      classBreakInfos?: Array<{ symbol: FakeSymbol }>
    }
    expect(properties.field).toBe('percent')
    expect(properties.valueExpression).toBeUndefined()
    expect(properties.classBreakInfos).toHaveLength(5)
    const first = properties.classBreakInfos?.[0].symbol.properties as { url?: string }
    const last = properties.classBreakInfos?.[4].symbol.properties as { url?: string }
    expect(Buffer.from(String(first.url).split(',')[1], 'base64').toString()).toContain('#edf8fb')
    expect(Buffer.from(String(last.url).split(',')[1], 'base64').toString()).toContain('#810f7c')
    expect(restoreAudiomSymbols(layer)).toBe(true)
    expect(layer.renderer).toBe(host)
  })

  it('uses the dropdown index for the ramp, not the property-key index', () => {
    const features = [1, 2, 3, 4, 5].map((value) => ({
      attributes: { OBJECTID: value, parcel_int: value, total_percent: value * 10 }
    }))
    const layer = {
      geometryType: 'polygon',
      objectIdField: 'OBJECTID',
      renderer: { kind: 'host', type: 'simple' },
      features
    }
    expect(applyAudiomSymbols(layer, modules, features, VectorStyleMode.Colors, 'total_percent', undefined, 1)).toBe(true)
    const painted = layer.renderer as unknown as FakeSymbol
    const infos = (painted.properties as { classBreakInfos?: Array<{ symbol: FakeSymbol }> }).classBreakInfos
    expect((infos?.[0].symbol.properties as { color?: string }).color).toBe('#fafa6e')
    expect((infos?.[4].symbol.properties as { color?: string }).color).toBe('#2a4858')
    expect(applyAudiomSymbols(layer, modules, features, VectorStyleMode.Colors, 'parcel_int', undefined, 0)).toBe(true)
    const firstStatistic = layer.renderer as unknown as FakeSymbol
    const firstInfos = (firstStatistic.properties as { classBreakInfos?: Array<{ symbol: FakeSymbol }> }).classBreakInfos
    expect((firstInfos?.[0].symbol.properties as { color?: string }).color).toBe('#edf8fb')
    expect((firstInfos?.[4].symbol.properties as { color?: string }).color).toBe('#810f7c')
  })

  it('keeps a saved host renderer when a later paint has nothing to draw', () => {
    const host = { kind: 'host', type: 'simple' }
    const painted = { kind: 'painted' }
    const layer = {
      geometryType: 'polygon',
      renderer: painted,
      __audiomOriginalRenderer: host,
      features: [{ attributes: { OBJECTID: 1, name: 'Hall' } }]
    }
    expect(applyAudiomSymbols(layer, modules, layer.features)).toBe(false)
    expect(layer.renderer).toBe(painted)
    expect(layer.__audiomOriginalRenderer).toBe(host)
  })

  it('paints a rules file category onto indoor features instead of flat grey', () => {
    const host = { kind: 'host', type: 'simple' }
    const features = [
      { attributes: { OBJECTID: 1, USE_TYPE: 'Office', fill: '#e7ecef', stroke: '#6c757d', 'fill-pattern': 'dot-pattern' } },
      { attributes: { OBJECTID: 2, USE_TYPE: 'Corridor', fill: '#d8e2dc', stroke: '#6c757d', 'fill-pattern': 'grid-pattern' } }
    ]
    const layer = {
      geometryType: 'polygon',
      objectIdField: 'OBJECTID',
      renderer: host,
      features,
      __audiomOriginalRenderer: undefined as unknown
    }
    expect(applyAudiomSymbols(layer, modules, features, VectorStyleMode.Colors, undefined, undefined, 0, 'indoor')).toBe(true)
    const painted = layer.renderer as unknown as FakeSymbol
    const properties = painted.properties as {
      field?: string
      uniqueValueInfos?: Array<{ value: string }>
      defaultSymbol?: unknown
    }
    expect(properties.field).toBe('USE_TYPE')
    expect(properties.uniqueValueInfos?.map((info) => info.value).sort()).toEqual(['Corridor', 'Office'])
    expect(properties.defaultSymbol).toBeTruthy()
    expect(layer.__audiomOriginalRenderer).toBe(host)
  })

  it('paints indoor floors with colors and ignores fill patterns', () => {
    const features = [
      { attributes: { OBJECTID: 1, USE_TYPE: 'Restroom', fill: '#e7ecef', stroke: '#6c757d', 'fill-pattern': 'dot-pattern' } }
    ]
    const layer = {
      geometryType: 'polygon',
      objectIdField: 'OBJECTID',
      renderer: { kind: 'host', type: 'simple' },
      features
    }
    expect(applyAudiomSymbols(layer, modules, features, VectorStyleMode.Both, undefined, undefined, 0, 'indoor')).toBe(true)
    const painted = layer.renderer as unknown as FakeSymbol
    const infos = (painted.properties as { uniqueValueInfos?: Array<{ symbol: FakeSymbol }> }).uniqueValueInfos
    expect((infos?.[0].symbol.properties as { url?: string }).url).toBeUndefined()
    expect((infos?.[0].symbol.properties as { color?: string }).color).toBe('#e7ecef')
  })

  it('leaves the host renderer when a rules file excluded every feature', () => {
    const host = { kind: 'host', type: 'simple' }
    const features = [{ attributes: { OBJECTID: 1, USE_TYPE: 'Level' } }]
    const layer = {
      geometryType: 'polygon',
      renderer: host,
      features
    }
    expect(applyAudiomSymbols(layer, modules, features, VectorStyleMode.Colors, undefined, undefined, 0, 'indoor', true)).toBe(false)
    expect(layer.renderer).toBe(host)
  })

  it('paints travel and indoor as flat grey and keeps the host renderer saved', () => {
    const host = { kind: 'host', type: 'simple' }
    const features = [1, 2, 3, 4, 5].map((value) => ({
      attributes: { OBJECTID: value, percent: value * 10 }
    }))
    const layer: {
      geometryType: string
      objectIdField: string
      renderer: { type?: string, symbol?: { properties?: { color?: string } } }
      features: typeof features
      __audiomOriginalRenderer?: unknown
    } = {
      geometryType: 'polygon',
      objectIdField: 'OBJECTID',
      renderer: host,
      features
    }
    expect(applyAudiomSymbols(layer, modules, features, VectorStyleMode.Colors, 'percent', undefined, 0, 'heatmap')).toBe(true)
    expect(layer.renderer).not.toBe(host)
    expect(layer.__audiomOriginalRenderer).toBe(host)
    expect(applyAudiomSymbols(layer, modules, features, VectorStyleMode.Colors, 'percent', undefined, 0, 'travel')).toBe(true)
    expect(layer.renderer).not.toBe(host)
    expect(layer.renderer.type).toBe('simple')
    expect(layer.renderer.symbol.properties.color).toBe('#b0b0b0')
    expect(layer.__audiomOriginalRenderer).toBe(host)
    expect(applyAudiomSymbols(layer, modules, features, VectorStyleMode.Colors, 'percent', undefined, 0, 'heatmap')).toBe(true)
    expect(layer.renderer).not.toBe(host)
    expect(layer.renderer.symbol).toBeUndefined()
    expect(applyAudiomSymbols(layer, modules, features, VectorStyleMode.Colors, 'percent', undefined, 0, 'indoor')).toBe(true)
    expect(layer.renderer.symbol.properties.color).toBe('#b0b0b0')
    expect(layer.__audiomOriginalRenderer).toBe(host)
    expect(applyAudiomSymbols(layer, modules, features, VectorStyleMode.Colors, 'percent', undefined, 0, 'standard')).toBe(true)
    expect(layer.renderer.symbol.properties.color).toBe('#b0b0b0')
    expect(layer.__audiomOriginalRenderer).toBe(host)
  })

  it('keeps polygon class breaks for a heatmap map type', () => {
    const host = { kind: 'host', type: 'simple' }
    const features = [1, 2, 3, 4, 5].map((value) => ({
      attributes: { OBJECTID: value, percent: value * 10 }
    }))
    const layer = {
      geometryType: 'polygon',
      objectIdField: 'OBJECTID',
      renderer: host,
      features
    }
    expect(applyAudiomSymbols(layer, modules, features, VectorStyleMode.Colors, 'percent')).toBe(true)
    const painted = layer.renderer as unknown as FakeSymbol
    const properties = painted.properties as {
      field?: string
      classBreakInfos?: unknown[]
    }
    expect(properties.field).toBe('percent')
    expect(properties.classBreakInfos).toHaveLength(5)
    expect(restoreAudiomSymbols(layer)).toBe(true)
    expect(layer.renderer).toBe(host)
  })

  it('does not replace a host heatmap renderer', () => {
    const host = { kind: 'heatmap', type: 'heatmap' }
    const layer = {
      geometryType: 'polygon',
      renderer: host,
      features: [{ attributes: { OBJECTID: 1, percent: 10 } }, { attributes: { OBJECTID: 2, percent: 90 } }]
    }
    expect(applyAudiomSymbols(layer, modules, layer.features)).toBe(false)
    expect(layer.renderer).toBe(host)
  })

  it('rebuilds class breaks when the pattern or color mode changes', () => {
    const features = [1, 2, 3, 4, 5].map((value) => ({
      attributes: { OBJECTID: value, percent: value * 10 }
    }))
    const layer = {
      geometryType: 'polygon',
      objectIdField: 'OBJECTID',
      renderer: { kind: 'host', type: 'simple' },
      features
    }
    expect(applyAudiomSymbols(layer, modules, features, VectorStyleMode.Colors, 'percent')).toBe(true)
    const colors = layer.renderer as unknown as FakeSymbol
    const colorSymbol = (colors.properties as {
      classBreakInfos: Array<{ symbol: FakeSymbol }>
    }).classBreakInfos[0].symbol
    expect((colorSymbol.properties as { url?: string }).url).toBeUndefined()
    expect((colorSymbol.properties as { color?: string }).color).toBeTruthy()

    expect(applyAudiomSymbols(layer, modules, features, VectorStyleMode.Patterns, 'percent')).toBe(true)
    const patterns = layer.renderer as unknown as FakeSymbol
    expect(patterns).not.toBe(colors)
    const patternSymbol = (patterns.properties as {
      classBreakInfos: Array<{ symbol: FakeSymbol }>
    }).classBreakInfos[0].symbol
    expect(String((patternSymbol.properties as { url?: string }).url)).toContain('svg')
    expect((patternSymbol.properties as { color?: string }).color).toBeUndefined()
  })

  it('paints a varying measure when the requested field is missing or flat', () => {
    const features = [1, 2, 3, 4, 5].map((value) => ({
      attributes: { OBJECTID: value, percent: value * 10, code: 1 }
    }))
    const layer = {
      geometryType: 'polygon',
      objectIdField: 'OBJECTID',
      renderer: { kind: 'host', type: 'simple' },
      features
    }
    expect(applyAudiomSymbols(layer, modules, features, VectorStyleMode.Colors, 'casesPerOneMillion')).toBe(true)
    expect((layer.renderer as unknown as FakeSymbol).properties).toMatchObject({ field: 'percent' })

    const flat = {
      geometryType: 'polygon',
      objectIdField: 'OBJECTID',
      renderer: { kind: 'host', type: 'simple' },
      features
    }
    expect(applyAudiomSymbols(flat, modules, features, VectorStyleMode.Patterns, 'code', {
      code: { min: 1, max: 1 }
    })).toBe(true)
    const painted = flat.renderer as unknown as FakeSymbol
    expect(painted.properties).toMatchObject({ field: 'percent' })
    const symbol = (painted.properties as {
      classBreakInfos: Array<{ symbol: FakeSymbol }>
    }).classBreakInfos[0].symbol
    expect(String((symbol.properties as { url?: string }).url)).toContain('svg')
  })

  it('leaves a layer with no Audiom style keys untouched', () => {
    const host = { kind: 'host' }
    const layer = {
      geometryType: 'polygon',
      renderer: host,
      features: [{ attributes: { OBJECTID: 1, name: 'Hall' } }]
    }
    expect(applyAudiomSymbols(layer, modules, layer.features)).toBe(false)
    expect(layer.renderer).toBe(host)
  })
})

describe('audiom labels', () => {
  const units = {
    geometryType: 'polygon',
    fields: [{ name: 'NAME' }, { name: 'USE_TYPE' }, { name: 'OBJECTID' }],
    displayField: 'NAME',
    labelingInfo: [{ kind: 'host' }],
    labelsVisible: false
  }

  it('prefers the room name fields the embed prints, not the object id', () => {
    expect(labelFieldsOf(units)).toEqual(['NAME', 'USE_TYPE'])
    expect(labelFieldsOf({
      fields: [{ name: 'name' }, { name: 'ruleName' }, { name: 'directionSymbol' }]
    })).toEqual(['name', 'ruleName'])
  })

  it('skips empty, unlabeled, direction arrows, and Level polygons', () => {
    const expression = labelExpression(['NAME', 'USE_TYPE'], {
      directionField: 'directionSymbol',
      levelUseField: 'USE_TYPE'
    })
    expect(expression).toContain('unlabeled')
    const values = expression.slice(expression.indexOf('var values'))
    expect(values.indexOf('$feature["NAME"]')).toBeLessThan(values.indexOf('$feature["USE_TYPE"]'))
    expect(expression).toContain('$feature["directionSymbol"]')
    expect(expression).toContain('== "level"')
  })

  it('labels an indoor room layer and restores the host labeling', () => {
    const layer = { ...units }
    expect(applyAudiomLabels(layer, VectorStyleMode.Colors, true)).toBe(true)
    expect(layer.labelsVisible).toBe(true)
    const info = (layer.labelingInfo as unknown as Array<{
      minScale: number
      labelPlacement: string
      symbol: { color: string, haloColor: string }
      labelExpressionInfo: { expression: string }
    }>)[0]
    expect(info.minScale).toBe(LABEL_MIN_SCALE)
    expect(info.labelPlacement).toBe('always-horizontal')
    expect(info.symbol).toMatchObject({ color: '#1f2933', haloColor: '#ffffff' })
    expect(info.labelExpressionInfo.expression).toContain('$feature["NAME"]')
    expect(restoreAudiomLabels(layer)).toBe(true)
    expect(layer.labelingInfo).toEqual([{ kind: 'host' }])
    expect(layer.labelsVisible).toBe(false)
    expect((layer as { __audiomLabelState?: unknown }).__audiomLabelState).toBeUndefined()
  })

  it('hides the floor catalog and a turned-off label toggle', () => {
    const levels = {
      geometryType: 'polygon',
      fields: [{ name: 'NAME' }],
      labelingInfo: [{ kind: 'host-level' }],
      labelsVisible: true
    }
    expect(applyAudiomLabels(levels, VectorStyleMode.Colors, true, { floorCatalog: true })).toBe(true)
    expect(levels.labelsVisible).toBe(false)
    expect(levels.labelingInfo).toEqual([])
    expect(restoreAudiomLabels(levels)).toBe(true)
    expect(levels.labelingInfo).toEqual([{ kind: 'host-level' }])

    const rooms = { ...units, labelsVisible: true }
    expect(applyAudiomLabels(rooms, VectorStyleMode.Colors, false)).toBe(true)
    expect(rooms.labelsVisible).toBe(false)
    expect(rooms.labelingInfo).toEqual([])
  })

  it('uses a light halo when the vector style is hidden', () => {
    const layer: {
      geometryType: string
      fields: Array<{ name: string }>
      displayField: string
      labelingInfo?: unknown
      labelsVisible?: boolean
    } = {
      ...units,
      labelingInfo: undefined,
      labelsVisible: undefined
    }
    expect(applyAudiomLabels(layer, VectorStyleMode.Hidden, true)).toBe(true)
    const info = (layer.labelingInfo as Array<{ symbol: { color: string, haloColor: string } }>)[0]
    expect(info.symbol).toMatchObject({ color: '#ffffff', haloColor: '#000000' })
  })
})
