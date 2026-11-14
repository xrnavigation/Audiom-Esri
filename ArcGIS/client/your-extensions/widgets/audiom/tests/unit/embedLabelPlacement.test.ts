import { embedLabelStyle } from '../../src/runtime/embedLabelPlacement'

describe('embed label layers', () => {
  const room = { name: 'L1E250 (Level 1)', USE_TYPE: 'Office' }

  it('uses the embed label layers, so a default room is hidden below zoom 9', () => {
    expect(embedLabelStyle(room, 8, 'colors')).toBeNull()
    expect(embedLabelStyle(room, 9, 'colors')?.text).toBe('L1E250 (Level 1)')
    expect(embedLabelStyle({ name: 'Campus', labelMinZoom: 0 }, 4, 'colors')?.text).toBe('Campus')
    expect(embedLabelStyle({ name: 'District', labelMinZoom: 6 }, 5, 'colors')).toBeNull()
    expect(embedLabelStyle({ name: 'District', labelMinZoom: 6 }, 7, 'colors')?.text).toBe('District')
  })

  it('takes size and padding from the layer that is visible at that zoom', () => {
    const detailed = embedLabelStyle(room, 9, 'colors')
    const close = embedLabelStyle(room, 21, 'colors')
    expect(detailed?.size).toBe(12)
    expect(detailed?.padding).toBe(12)
    expect(close?.padding).toBe(12)
    expect(close?.size).toBe(14)
    expect(embedLabelStyle({ name: 'Campus', labelMinZoom: 0 }, 4, 'colors')?.padding).toBe(40)
  })
})
