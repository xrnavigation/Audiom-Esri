import { applyAudiomSymbols, colorWithOpacity, restoreAudiomSymbols, styleKey, symbolFor, patternTileUrl } from '../../src/runtime/audiomSymbols'

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
      url: patternTileUrl('caret-pattern'),
      width: 16,
      height: 16
    })
    expect(String((patterned.properties as { url: string }).url)).toContain('svg')
  })

  it('suppresses fill color in patterns mode and skips none/hidden', () => {
    const patterned = symbolFor(modules, 'polygon', {
      fill: '#ff0000',
      'fill-pattern': 'dot-pattern'
    }, 'patterns') as FakeSymbol
    expect((patterned.properties as { url?: string }).url).toBe(patternTileUrl('dot-pattern'))
    expect((patterned.properties as { color?: string }).color).toBeUndefined()
    expect(symbolFor(modules, 'polygon', { fill: '#ff0000' }, 'none')).toBeNull()
    expect(symbolFor(modules, 'polygon', { fill: '#ff0000' }, 'hidden')).toBeNull()
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
    expect(layer.features[0].attributes.audiomStyle).toContain('#7bbf75')
    expect(restoreAudiomSymbols(layer)).toBe(true)
    expect(layer.renderer).toBe(host)
    expect(restoreAudiomSymbols(layer)).toBe(false)
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
