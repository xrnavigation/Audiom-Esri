/**
 * The compass sits at the configured center until Audiom reports a position.
 * Projecting that center must happen once per position, not once per render.
 */
import { React } from 'jimu-core'

jest.mock('jimu-arcgis', () => ({
  __esModule: true,
  JimuMapViewComponent: (): null => null,
  MapViewManager: {
    getInstance: () => ({
      createJimuMapView: () => Promise.resolve(null),
      destroyJimuMapView: jest.fn()
    })
  }
}))

jest.mock('../../src/utils/mapSyncManager', () => ({
  __esModule: true,
  AUTO_SYNC_LAYERS: false,
  getMapSyncManager: () => ({
    attach: jest.fn(),
    hasChanges: jest.fn().mockReturnValue(false),
    addChangeListener: jest.fn(),
    removeChangeListener: jest.fn()
  })
}))

import { widgetRender, wrapWidget } from 'jimu-for-test'
import _Widget from '../../src/runtime/widget'
import { makeImmutableConfig } from '../helpers/configFactories'
import { RuntimeLocation } from '../../src/setting/runtimeLocation'
import { setMapModuleLoader } from '../../src/runtime/esriMapSurface'

const render = widgetRender()

describe('Audiom compass at the configured center', () => {
  afterEach(() => { setMapModuleLoader(null) })

  it('stops projecting the center once it is placed, while no avatar is reported', async () => {
    let projections = 0
    setMapModuleLoader(async (modules) => {
      if (modules[0] === 'esri/layers/GraphicsLayer') {
        return [class GraphicsLayer {
          constructor (public properties: unknown) {}
          removeAll () {}
          add () {}
        }]
      }
      if (modules[0] === 'esri/Graphic') {
        return [
          class Graphic { constructor (public properties: unknown) {} },
          class Point { constructor (public properties: unknown) {} }
        ]
      }
      return [
        class Map { constructor (public properties: unknown) {} },
        class MapView {
          container: HTMLElement
          constructor (properties: { container: HTMLElement }) {
            this.container = properties.container
          }

          toScreen () {
            projections++
            return { x: 120, y: 80 }
          }

          watch () { return { remove () {} } }
          on () { return { remove () {} } }
          destroy () {}
        }
      ]
    })
    const Widget = wrapWidget(_Widget, {
      config: makeImmutableConfig({
        runtimeLocation: RuntimeLocation.Bundled,
        mapItemId: 'item-compass',
        centerLongitude: -157.86,
        centerLatitude: 21.31
      }) as any
    })
    const { unmount } = render(<Widget widgetId="audiom-compass" />)
    // Not inside act: act waits for React to go idle, and a loop never does.
    await new Promise((resolve) => setTimeout(resolve, 200))
    const settled = projections
    // Nothing moved the view or the center after that, so nothing reprojects.
    await new Promise((resolve) => setTimeout(resolve, 300))
    const later = projections
    unmount()
    expect(settled).toBeGreaterThan(0)
    expect(later - settled).toBe(0)
  })
})
