import { featureLevel, labelAnchor, labelsForFeatures, labelText, thinLabels, toLonLat } from '../../src/runtime/audiomLabels'

describe('audiom label text', () => {
  it('uses the rules name the embed prints, not the campus title', () => {
    expect(labelText({
      name: '201A (Level 2)',
      NAME: '201A',
      USE_TYPE: 'Office',
      ruleName: 'Office',
      ruleType: 'office'
    })).toBe('201A (Level 2)')
    expect(labelText({ NAME: 'Esri Redlands Main Campus' })).toBeNull()
    expect(labelText({ name: 'Park' })).toBe('Park')
  })

  it('uses the rules expression when the file has not been stamped', () => {
    expect(labelText({
      NAME: '201A',
      USE_TYPE: 'Office',
      levelName: 'Level 2'
    })).toBe('201A (Level 2)')
    expect(labelText({ NAME: 'Lobby', levelOrdinal: 0 })).toBe('Lobby')
    expect(labelText({ ruleName: 'Office', ruleType: 'office' })).toBe('Office')
    expect(labelText({ USE_TYPE: 'Conference Room' })).toBeNull()
  })

  it('skips empty, unlabeled, direction arrows, and Level polygons', () => {
    expect(labelText({ name: '', ruleName: 'Office', ruleType: 'office' })).toBe('Office')
    expect(labelText({ name: 'Hall', directionSymbol: 'arrow', ruleType: 'walkway' })).toBeNull()
    expect(labelText({ name: 'Level 1', USE_TYPE: 'Level', ruleType: 'level' })).toBeNull()
    expect(labelText({ name: 'Level 1', ruleType: 'level' })).toBeNull()
    expect(labelText(null)).toBeNull()
  })
})

describe('audiom label placement', () => {
  it('puts the caption in the middle of a room', () => {
    const anchor = labelAnchor({
      rings: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]
    })
    expect(anchor?.x).toBeCloseTo(1)
    expect(anchor?.y).toBeCloseTo(1)
  })

  it('keeps a few-meter room on its own ring', () => {
    const anchor = labelAnchor({
      rings: [[
        [-117.194572865, 34.056551151],
        [-117.194600435, 34.056551076],
        [-117.194600500, 34.056570000],
        [-117.194572900, 34.056570100],
        [-117.194572865, 34.056551151]
      ]]
    })
    expect(anchor?.x).toBeCloseTo(-117.19458, 4)
    expect(anchor?.y).toBeCloseTo(34.05656, 4)
  })

  it('reads a GeoJSON polygon and a point', () => {
    expect(labelAnchor({
      type: 'Polygon',
      coordinates: [[[-117.2, 34.0], [-117.1, 34.0], [-117.1, 34.1], [-117.2, 34.1], [-117.2, 34.0]]]
    })).toEqual({ x: expect.closeTo(-117.15), y: expect.closeTo(34.05) })
    expect(labelAnchor({ longitude: -117.2, latitude: 34.1 })).toEqual({ x: -117.2, y: 34.1 })
  })

  it('converts a Web Mercator meter ring into longitude and latitude', () => {
    const geographic = toLonLat(0, 0)
    expect(geographic).toEqual({ x: 0, y: 0 })
    const projected = labelAnchor({ x: -13024380, y: 4035892 })
    expect(projected?.x).toBeCloseTo(-117, 0)
    expect(projected?.y).toBeGreaterThan(30)
    expect(projected?.y).toBeLessThan(40)
  })

  it('labels the selected floor, and every ruled room when none is selected', () => {
    const features = [
      {
        attributes: { name: 'Lobby (Level 1)', ruleType: 'lobby', levelOrdinal: 0 },
        geometry: { rings: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
      },
      {
        attributes: { name: '201A (Level 2)', ruleType: 'office', levelOrdinal: 1 },
        geometry: { rings: [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]] }
      },
      {
        attributes: { NAME: 'Esri Redlands Main Campus' },
        geometry: { rings: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] }
      }
    ]
    expect(labelsForFeatures(features, 1).map((item) => item.text)).toEqual(['201A (Level 2)'])
    expect(labelsForFeatures(features, 9).map((item) => item.text)).toEqual([
      'Lobby (Level 1)',
      '201A (Level 2)'
    ])
    expect(labelsForFeatures(features, null).map((item) => item.text)).toEqual([
      'Lobby (Level 1)',
      '201A (Level 2)'
    ])
    expect(featureLevel({ levelOrdinal: '2' })).toBe(2)
  })

  it('drops overlapping names using the padding the embed layer already set', () => {
    const placed = thinLabels([
      { text: 'Lobby', x: 0, y: 0, screenX: 10, screenY: 10, priority: 2, size: 12, padding: 12 },
      { text: 'Office', x: 1, y: 1, screenX: 14, screenY: 12, priority: 2, size: 12, padding: 12 },
      { text: 'Hall', x: 2, y: 2, screenX: 200, screenY: 10, priority: 2, size: 12, padding: 12 }
    ])
    expect(placed.map((item) => item.text)).toEqual(['Lobby', 'Hall'])
  })

  it('keeps a travel feature that has no floor', () => {
    expect(labelsForFeatures([
      { attributes: { name: 'Park' }, geometry: { x: -71.06, y: 42.36 } }
    ], null).map((item) => item.text)).toEqual(['Park'])
  })
})
