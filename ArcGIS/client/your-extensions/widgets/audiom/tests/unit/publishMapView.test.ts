/**
 * Map-widget assignment. The dropdown is the manifest flag. These tests
 * cover the view Audiom publishes so a selected widget is not an empty slot.
 */
import type { MountedMapView } from '../../src/runtime/esriMapSurface'

const created: Array<{ mapWidgetId: string, dataSourceId: string, isActive: boolean, isEnablePopup: boolean }> = []
const destroyed: string[] = []

jest.mock('jimu-arcgis', () => ({
  __esModule: true,
  MapViewManager: {
    getInstance: () => ({
      createJimuMapView: (options: { mapWidgetId: string, dataSourceId: string, isActive: boolean, isEnablePopup: boolean }) => {
        created.push(options)
        return Promise.resolve(null)
      },
      destroyJimuMapView: (id: string) => { destroyed.push(id) }
    })
  }
}))

import { ownedMapDataSourceId, publishOwnedMapView } from '../../src/runtime/publishMapView'

describe('owned map data source id', () => {
  it('prefers the connected web map over a feature layer', () => {
    expect(ownedMapDataSourceId(
      [
        { dataSourceId: 'layer-1' },
        { dataSourceId: 'map-1', mainDataSourceId: 'map-1' }
      ],
      {
        'layer-1': { type: 'FEATURE_LAYER' },
        'map-1': { type: 'WEB_MAP' }
      }
    )).toBe('map-1')
  })

  it('uses the only connection when its type is not written yet', () => {
    expect(ownedMapDataSourceId(
      [{ dataSourceId: 'dataSource_2', mainDataSourceId: 'dataSource_2' }],
      {}
    )).toBe('dataSource_2')
  })

  it('does not treat a list of feature layers as the map', () => {
    expect(ownedMapDataSourceId(
      [{ dataSourceId: 'layer-1' }, { dataSourceId: 'layer-2' }],
      { 'layer-1': { type: 'FEATURE_LAYER' }, 'layer-2': { type: 'FEATURE_LAYER' } }
    )).toBe('')
  })
})

describe('publishOwnedMapView', () => {
  beforeEach(() => {
    created.length = 0
    destroyed.length = 0
  })

  it('publishes an active view and does not enable the Esri popup', () => {
    const view = { destroy: jest.fn() } as unknown as MountedMapView
    publishOwnedMapView('widget_23', 'dataSource_2', view)
    expect(created).toEqual([{
      mapWidgetId: 'widget_23',
      dataSourceId: 'dataSource_2',
      view,
      isActive: true,
      isEnablePopup: false,
      mapViewManager: expect.any(Object)
    }])
  })

  it('releases the published view only after the surface has destroyed it', () => {
    const destroy = jest.fn()
    const view = { destroy } as unknown as MountedMapView
    const release = publishOwnedMapView('widget_23', '', view)
    release(false)
    expect(destroyed).toEqual([])
    expect(destroy).not.toHaveBeenCalled()
    release(true)
    expect(destroyed).toEqual(['widget_23-'])
    expect(destroy).not.toHaveBeenCalled()
  })
})
