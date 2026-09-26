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
      LayerDisposition.VisualOnly,
      LayerDisposition.VisualOnly
    ])
    expect(snapshot.records).toHaveLength(0)
  })

  it('keeps a feature that is out of scale and drops a hidden one', () => {
    const snapshot = snapshotFromMapView({
      map: {
        allLayers: {
          forEach (fn) {
            fn({
              id: 'rooms',
              title: 'Rooms',
              type: 'feature',
              visible: true,
              scaleVisible: false,
              geometryType: 'polygon',
              features: [{
                attributes: { OBJECTID: 7, name: 'Hall', fill: '#7bbf75', 'fill-pattern': 'grid-pattern' },
                geometry: { rings: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
              }]
            })
            fn({
              id: 'closed',
              title: 'Closed',
              type: 'feature',
              visible: false,
              geometryType: 'point',
              features: [{ attributes: { OBJECTID: 1 }, geometry: { x: 1, y: 2 } }]
            })
          }
        }
      }
    }, 'map-1')

    expect(snapshot.records).toHaveLength(1)
    expect(snapshot.records[0].navigable).toBe(true)
    expect(snapshot.records[0].key.recordId).toBe('7')
    expect(snapshot.records[0].geometry?.type).toBe('Polygon')
    expect(snapshot.records[0].attributes['fill-pattern']).toBe('grid-pattern')
    expect(snapshot.sources.find((source) => source.sourceId === 'closed')?.disposition).toBe(LayerDisposition.VisualOnly)
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
