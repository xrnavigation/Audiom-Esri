import { LayerDisposition } from '../../../../shared/audiom-runtime/src/types'
import { snapshotFromMapView } from '../../src/runtime/mapSnapshot'
import { startBundledRuntime } from '../../src/runtime/bundledRuntime'

describe('map snapshot', () => {
  it('describes the existing map without creating a page', () => {
    const snapshot = snapshotFromMapView({
      map: {
        allLayers: {
          forEach (fn) {
            fn({ id: 'rooms', title: 'Rooms', type: 'feature', visible: true, geometryType: 'polygon' })
            fn({ id: 'tiles', title: 'Tiles', type: 'tile', visible: true })
          }
        }
      }
    }, 'map-1')

    expect(snapshot.sources.map((source) => source.disposition)).toEqual([
      LayerDisposition.Bound,
      LayerDisposition.VisualOnly
    ])
    expect(snapshot.records).toHaveLength(1)
    expect(snapshot.records[0].key).toEqual({
      dataSourceId: 'map-1',
      layerId: 'rooms',
      recordId: 'rooms'
    })
  })

  it('starts the bundled runtime against that snapshot', async () => {
    const statuses: string[] = []
    const handle = startBundledRuntime('widget-1', {
      map: { allLayers: { forEach (fn) { fn({ id: 'rooms', title: 'Rooms', type: 'feature' }) } } }
    }, (status) => statuses.push(status))

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(handle.runtime.snapshot?.sources[0].displayName).toBe('Rooms')
    await handle.runtime.dispose()
  })
})
