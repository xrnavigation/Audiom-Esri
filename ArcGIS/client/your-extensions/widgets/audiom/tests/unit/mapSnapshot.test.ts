import { LayerDisposition } from '../../../../shared/audiom-runtime/src/types'
import { snapshotFeaturesFromMapView, snapshotFromMapView } from '../../src/runtime/mapSnapshot'
import { setMapModuleLoader } from '../../src/runtime/esriMapSurface'
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

    expect(snapshot.sources.map((source) => source.displayName)).toEqual(['Rooms'])
    expect(snapshot.sources.map((source) => source.disposition)).toEqual([
      LayerDisposition.Bound
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

  it('lists a visible feature that has no Audiom rule colors', () => {
    const snapshot = snapshotFromMapView({
      map: {
        allLayers: {
          forEach (fn) {
            fn({
              id: 'places',
              title: 'Places',
              type: 'feature',
              visible: true,
              geometryType: 'point',
              displayField: 'TITLE',
              features: [{
                attributes: { OBJECTID: 3, TITLE: 'Library' },
                geometry: { longitude: -71.06, latitude: 42.36 }
              }]
            })
          }
        }
      }
    }, 'map-1')

    expect(snapshot.sources[0].disposition).toBe(LayerDisposition.Bound)
    expect(snapshot.records).toHaveLength(1)
    expect(snapshot.records[0].navigable).toBe(true)
    expect(snapshot.records[0].attributes.name).toBe('Library')
    expect(snapshot.records[0].attributes.fill).toBeUndefined()
  })

  it('waits for a layer to load before querying its features', async () => {
    let ready = false
    const snapshot = await snapshotFeaturesFromMapView({
      map: {
        allLayers: {
          forEach (fn) {
            fn({
              id: 'places',
              title: 'Places',
              type: 'feature',
              visible: true,
              geometryType: 'point',
              displayField: 'TITLE',
              when () {
                ready = true
                return Promise.resolve()
              },
              createQuery () {
                return {}
              },
              queryFeatures () {
                if (!ready) return Promise.resolve({ features: [] })
                return Promise.resolve({
                  features: [{
                    attributes: { OBJECTID: 3, TITLE: 'Library' },
                    geometry: { longitude: -71.06, latitude: 42.36 }
                  }]
                })
              }
            })
            fn({
              id: 'group',
              title: 'Group',
              type: 'group',
              visible: true,
              layers: {
                forEach (child) {
                  child({
                    id: 'nested',
                    title: 'Nested',
                    type: 'feature',
                    visible: true,
                    geometryType: 'point',
                    createQuery () { return {} },
                    queryFeatures () {
                      return Promise.resolve({
                        features: [{
                          attributes: { OBJECTID: 9, name: 'Cafe' },
                          geometry: { x: 1, y: 2 }
                        }]
                      })
                    }
                  })
                }
              }
            })
          }
        }
      }
    }, 'map-1')

    expect(snapshot.records.map((record) => record.attributes.name).sort()).toEqual(['Cafe', 'Library'])
  })

  it('reads Esri layer fields from the prototype and queries sublayers', async () => {
    const prototype = {
      type: 'feature',
      geometryType: 'point',
      displayField: 'TITLE',
      objectIdField: 'OBJECTID',
      createQuery () {
        return { where: '' }
      },
      queryFeatures (query: { where?: string }) {
        expect(query.where).toBe('1=1')
        return Promise.resolve({
          features: [{
            attributes: { OBJECTID: 4, TITLE: 'Museum' },
            geometry: { longitude: -71.1, latitude: 42.3 }
          }]
        })
      }
    }
    const featureLayer = Object.create(prototype) as {
      id: string
      title: string
      visible: boolean
    }
    featureLayer.id = 'places'
    featureLayer.title = 'Places'
    featureLayer.visible = true
    const sublayer = {
      id: 'parcels',
      title: 'Parcels',
      type: 'feature',
      visible: true,
      geometryType: 'point',
      createQuery () { return {} },
      queryFeatures () {
        return Promise.resolve({
          features: [{
            attributes: { OBJECTID: 8, name: 'Lot 8' },
            geometry: { x: 3, y: 4 }
          }]
        })
      }
    }
    const snapshot = await snapshotFeaturesFromMapView({
      map: {
        allLayers: {
          forEach (fn) {
            fn(featureLayer)
            fn({
              id: 'image',
              title: 'Image',
              type: 'map-image',
              visible: true,
              sublayers: { forEach (child) { child(sublayer) } }
            })
          }
        }
      }
    }, 'map-1')

    expect(snapshot.records.map((record) => record.attributes.name).sort()).toEqual(['Lot 8', 'Museum'])
  })

  it('lists the map layers and omits the avatar graphics layer', async () => {
    const snapshot = await snapshotFeaturesFromMapView({
      map: {
        allLayers: {
          forEach (fn) {
            fn({
              id: 'audiom-avatar',
              title: 'Audiom avatar',
              type: 'graphics',
              listMode: 'hide',
              visible: true
            })
            fn({
              id: 'streets',
              title: 'Streets',
              type: 'vector-tile',
              isBasemap: true,
              visible: true
            })
            fn({
              id: 'places',
              title: 'Places',
              type: 'feature',
              visible: true,
              geometryType: 'point',
              createQuery () { return {} },
              queryFeatures () {
                return Promise.resolve({ features: [] })
              }
            })
          }
        }
      }
    }, 'map-1')

    expect(snapshot.sources.map((source) => source.displayName)).toEqual(['Places'])
    expect(snapshot.sources[0].disposition).toBe('bound')
  })

  it('skips imagery layers that reject feature queries', async () => {
    const snapshot = await snapshotFeaturesFromMapView({
      map: {
        allLayers: {
          forEach (fn) {
            fn({
              id: 'ortho',
              title: 'Ortho 1 1 hm s va153 2025 1 sid',
              type: 'imagery',
              visible: true,
              createQuery () { return {} },
              queryFeatures () {
                return Promise.reject(new Error('query operation is not supported'))
              }
            })
            fn({
              id: 'parcels',
              title: 'Parcels',
              type: 'feature',
              visible: true,
              geometryType: 'polygon',
              displayField: 'NAME',
              createQuery () { return {} },
              queryFeatures () {
                return Promise.resolve({
                  features: [{
                    attributes: { OBJECTID: 2, NAME: 'Lot 2' },
                    geometry: { rings: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
                  }]
                })
              }
            })
          }
        }
      }
    }, 'map-1')

    expect(snapshot.sources.map((source) => source.displayName)).toEqual(['Parcels'])
    expect(snapshot.records.map((record) => record.attributes.name)).toEqual(['Lot 2'])
  })

  it('projects the layer spatial reference to longitude and latitude', async () => {
    setMapModuleLoader(async (modules) => {
      if (modules[0] !== 'esri/geometry/projection') return []
      return [{
        project (geometry: { rings: number[][][] }) {
          return {
            rings: geometry.rings.map((ring) => ring.map(() => [-77.449, 38.769]))
          }
        }
      }, class SpatialReference { wkid: number; constructor (properties: { wkid: number }) { this.wkid = properties.wkid } }]
    })
    const snapshot = await snapshotFeaturesFromMapView({
      map: {
        allLayers: {
          forEach (fn) {
            fn({
              id: 'impervious',
              title: 'percentImpervious_allMP_compare_naip',
              type: 'feature',
              visible: true,
              geometryType: 'polygon',
              spatialReference: { wkid: 2283 },
              createQuery () { return {} },
              queryFeatures (query: { outSpatialReference?: { wkid: number } }) {
                expect(query.outSpatialReference).toEqual({ wkid: 4326 })
                return Promise.resolve({
                  features: [{
                    attributes: { OBJECTID: 1 },
                    geometry: {
                      rings: [[
                        [286790.3261000002, 4294282.0997],
                        [286800, 4294282.0997],
                        [286800, 4294290],
                        [286790.3261000002, 4294282.0997]
                      ]]
                    }
                  }]
                })
              }
            })
          }
        }
      }
    }, 'map-1')

    const coordinates = snapshot.records[0].geometry?.coordinates as number[][][]
    expect(coordinates[0][0]).toEqual([-77.449, 38.769])
    setMapModuleLoader(null)
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
