import { destroyMapSurface, type MountedMapSurface } from '../../src/runtime/esriMapSurface'

describe('destroyMapSurface', () => {
  it('destroys a read-only Esri view without assigning destroy', () => {
    const destroy = jest.fn()
    const view = {}
    Object.defineProperty(view, 'destroy', { configurable: false, writable: false, value: destroy })
    const surface = { view, ownedMap: true } as MountedMapSurface

    expect(() => destroyMapSurface(surface)).not.toThrow()
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(surface.destroyed).toBe(true)
  })
})
