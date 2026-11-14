import { viewpointReadyForItem } from '../../src/runtime/mapViewpoint'

describe('viewpointReadyForItem', () => {
  it('treats a saved config with no marker as ready for its own item', () => {
    expect(viewpointReadyForItem('item-1', undefined, 'item-1')).toBe(true)
    expect(viewpointReadyForItem('item-1', undefined, undefined)).toBe(true)
  })

  it('does not treat a newly connected item as ready for the previous center', () => {
    expect(viewpointReadyForItem('item-2', undefined, 'item-1')).toBe(false)
    expect(viewpointReadyForItem('item-2', 'item-1', 'item-1')).toBe(false)
    expect(viewpointReadyForItem('item-2', '', 'item-2')).toBe(false)
  })

  it('is ready only after the marker names the item on screen', () => {
    expect(viewpointReadyForItem('item-2', 'item-2', 'item-1')).toBe(true)
    expect(viewpointReadyForItem('', 'item-2', 'item-2')).toBe(false)
  })
})
