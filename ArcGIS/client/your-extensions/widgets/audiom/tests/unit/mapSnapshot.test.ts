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
    expect(snapshot.sources[0].mapType).toBe('travel')
  })

  it('marks a configured service as a heatmap', () => {
    const snapshot = snapshotFromMapView({
      map: {
        allLayers: {
          forEach (fn) {
            fn({
              id: 'impervious',
              title: 'Impervious',
              type: 'feature',
              visible: true,
              geometryType: 'polygon',
              url: 'https://gis.example/FeatureServer/0'
            })
          }
        }
      }
    }, 'map-1', [{
      url: 'https://gis.example/FeatureServer/0',
      mapType: 'heatmap'
    }])

    expect(snapshot.sources[0].mapType).toBe('heatmap')
  })

  it('uses the only configured heatmap when the layer id does not match', () => {
    const snapshot = snapshotFromMapView({
      map: {
        allLayers: {
          forEach (fn) {
            fn({
              id: 'layer-from-experience-builder',
              title: 'percentImpervious_allMP_compare_nai',
              type: 'feature',
              visible: true,
              geometryType: 'polygon'
            })
          }
        }
      }
    }, 'map-1', [{
      id: 'dataSource_1',
      title: 'Impervious',
      mapType: 'heatmap'
    }])

    expect(snapshot.sources[0].mapType).toBe('heatmap')
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

  it('keeps the category Audiom uses to find a step sound', () => {
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
              features: [{
                attributes: {
                  OBJECTID: 3,
                  name: 'Boston Common',
                  ruleType: 'park',
                  ruleName: 'Park',
                  soundPriority: 2
                },
                geometry: { longitude: -71.06, latitude: 42.36 }
              }]
            })
          }
        }
      }
    }, 'map-1')

    expect(snapshot.records[0].attributes.name).toBe('Boston Common')
    expect(snapshot.records[0].attributes.ruleType).toBe('park')
    expect(snapshot.records[0].attributes.ruleName).toBe('Park')
    expect(snapshot.records[0].attributes.soundPriority).toBe(2)
  })

  it('uses a plain layer type column when Audiom has no category', () => {
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
              displayField: 'NAME',
              features: [{
                attributes: { OBJECTID: 3, NAME: 'Boston Common', TYPE: 'park' },
                geometry: { longitude: -71.06, latitude: 42.36 }
              }]
            })
          }
        }
      }
    }, 'map-1')

    expect(snapshot.records[0].attributes.name).toBe('Boston Common')
    expect(snapshot.records[0].attributes.ruleType).toBe('park')
  })

  it('stores the tooltip title when the name is not in a column called name', () => {
    const snapshot = snapshotFromMapView({
      map: {
        allLayers: {
          forEach (fn) {
            fn({
              id: 'parcels',
              title: 'percentImpervious_allMP_compare_raip',
              type: 'feature',
              visible: true,
              geometryType: 'polygon',
              objectIdField: 'OBJECTID',
              popupTemplate: { title: '{OWNER}' },
              features: [{
                attributes: { OBJECTID: 7, OWNER: 'CITY OF MANASSAS PARK', percentImpervious: 42 },
                geometry: { rings: [[[-77.48, 38.85], [-77.47, 38.85], [-77.47, 38.86], [-77.48, 38.85]]] }
              }]
            })
          }
        }
      }
    }, 'map-1')

    expect(snapshot.records).toHaveLength(1)
    expect(snapshot.records[0].attributes.name).toBe('CITY OF MANASSAS PARK')
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

  it('drops a plot whose projection did not become longitude and latitude', async () => {
    setMapModuleLoader(async () => {
      throw new Error('projection engine missing')
    })
    const snapshot = await snapshotFeaturesFromMapView({
      map: {
        allLayers: {
          forEach (fn) {
            fn({
              id: 'parcels',
              title: 'Parcels',
              type: 'feature',
              visible: true,
              geometryType: 'polygon',
              spatialReference: { wkid: 3857 },
              createQuery () { return {} },
              queryFeatures () {
                return Promise.resolve({
                  features: [{
                    attributes: { OBJECTID: 1, NAME: 'Lot 1' },
                    geometry: {
                      rings: [[
                        [-8610000, 4680000],
                        [-8609000, 4680000],
                        [-8609000, 4681000],
                        [-8610000, 4680000]
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

    expect(snapshot.records).toEqual([])
    setMapModuleLoader(null)
  })

  it('queries the tracts in the current view, not the first page of the service', async () => {
    const extent = { xmin: -77.48, ymin: 38.74, xmax: -77.46, ymax: 38.76 }
    const snapshot = await snapshotFeaturesFromMapView({
      view: { extent },
      map: {
        allLayers: {
          forEach (fn) {
            fn({
              id: 'parcels',
              title: 'Parcels',
              type: 'feature',
              visible: true,
              geometryType: 'polygon',
              createQuery () { return {} },
              queryFeatures (query: { geometry?: unknown, spatialRelationship?: string }) {
                expect(query.geometry).toBe(extent)
                expect(query.spatialRelationship).toBe('intersects')
                return Promise.resolve({
                  features: [{
                    attributes: { OBJECTID: 9, NAME: 'Parcel 9' },
                    geometry: { rings: [[[-77.471, 38.749], [-77.469, 38.749], [-77.469, 38.751], [-77.471, 38.749]]] }
                  }]
                })
              }
            })
          }
        }
      }
    }, 'map-1')

    expect(snapshot.records.map((record) => record.attributes.name)).toEqual(['Parcel 9'])
  })

  it('includes the tract under the indicator when it is not in the view page', async () => {
    const snapshot = await snapshotFeaturesFromMapView({
      map: {
        allLayers: {
          forEach (fn) {
            fn({
              id: 'parcels',
              title: 'Parcels',
              type: 'feature',
              visible: true,
              geometryType: 'polygon',
              objectIdField: 'OBJECTID',
              createQuery () { return {} },
              queryFeatures (query: { geometry?: { type?: string, x?: number } }) {
                if (query.geometry?.type === 'point') {
                  expect(query.geometry.x).toBe(-77.47)
                  return Promise.resolve({
                    features: [{
                      attributes: { OBJECTID: 9, NAME: 'Parcel 9' },
                      geometry: { rings: [[[-77.471, 38.749], [-77.469, 38.749], [-77.469, 38.751], [-77.471, 38.749]]] }
                    }]
                  })
                }
                return Promise.resolve({
                  features: [{
                    attributes: { OBJECTID: 1, NAME: 'Parcel 1' },
                    geometry: { rings: [[[-77.2, 38.5], [-77.1, 38.5], [-77.1, 38.6], [-77.2, 38.5]]] }
                  }]
                })
              }
            })
          }
        }
      }
    }, 'map-1', undefined, undefined, { longitude: -77.47, latitude: 38.75 })

    expect(snapshot.records.map((record) => record.attributes.name)).toEqual(['Parcel 1', 'Parcel 9'])
  })

  it('keeps every part of a multipart polygon so each piece can be entered', async () => {
    const snapshot = await snapshotFeaturesFromMapView({
      map: {
        allLayers: {
          forEach (fn) {
            fn({
              id: 'tracts',
              title: 'Tracts',
              type: 'feature',
              visible: true,
              geometryType: 'polygon',
              objectIdField: 'OBJECTID',
              createQuery () { return {} },
              queryFeatures () {
                return Promise.resolve({
                  features: [{
                    attributes: { OBJECTID: 5, NAME: 'Tract 5' },
                    geometry: {
                      rings: [
                        [[-77.5, 38.7], [-77.5, 38.8], [-77.4, 38.8], [-77.4, 38.7], [-77.5, 38.7]],
                        [[-77.2, 38.7], [-77.2, 38.8], [-77.1, 38.8], [-77.1, 38.7], [-77.2, 38.7]]
                      ]
                    }
                  }]
                })
              }
            })
          }
        }
      }
    }, 'map-1')

    const geometry = snapshot.records[0].geometry
    expect(geometry?.type).toBe('MultiPolygon')
    expect((geometry?.coordinates as number[][][][]).length).toBe(2)
  })

  it('copies field aliases as plain objects after the layer loads', async () => {
    const snapshot = await snapshotFeaturesFromMapView({
      map: {
        allLayers: {
          forEach (fn) {
            fn({
              id: 'impervious',
              title: 'Parcels',
              type: 'feature',
              visible: true,
              geometryType: 'polygon',
              fields: [{ name: 'OBJECTID', alias: 'OBJECTID', type: 'oid' }],
              when () {
                this.fields = [{
                  name: 'total_percent',
                  alias: 'Percent Impervious (percent)',
                  type: 'double'
                }]
                return Promise.resolve()
              },
              createQuery () { return {} },
              queryFeatures () {
                return Promise.resolve({ features: [] })
              }
            })
          }
        }
      }
    }, 'map-1')

    const queried = (snapshot as { queriedLayers?: Array<{ fields?: Array<{ name?: string, alias?: string }> }> }).queriedLayers
    expect(queried?.[0].fields).toEqual([{
      name: 'total_percent',
      alias: 'Percent Impervious (percent)',
      type: 'double'
    }])
  })

  it('excludes a basemap base layer that rides in allLayers', async () => {
    let loaded = false
    const hillshade = {
      id: 'hillshade',
      title: 'World_Hillshade',
      type: 'feature',
      visible: true,
      when () {
        loaded = true
        return Promise.resolve()
      },
      createQuery () { return {} },
      queryFeatures () { return Promise.resolve({ features: [] }) }
    }
    const places = {
      id: 'places',
      title: 'Places',
      type: 'feature',
      visible: true,
      geometryType: 'point',
      createQuery () { return {} },
      queryFeatures () {
        return Promise.resolve({
          features: [{
            attributes: { OBJECTID: 1, name: 'Library' },
            geometry: { longitude: -71.06, latitude: 42.36 }
          }]
        })
      }
    }
    const snapshot = await snapshotFeaturesFromMapView({
      map: {
        allLayers: { forEach (fn) { fn(hillshade); fn(places) } },
        basemap: { baseLayers: { forEach (fn) { fn(hillshade) } } }
      }
    }, 'map-1')

    expect(loaded).toBe(false)
    expect(snapshot.sources.map((source) => source.displayName)).toEqual(['Places'])
    expect(snapshot.records.map((record) => record.attributes.name)).toEqual(['Library'])
  })

  it('skips a layer whose load never resolves without failing the snapshot', async () => {
    jest.useFakeTimers()
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const pending = snapshotFeaturesFromMapView({
        map: {
          allLayers: {
            forEach (fn) {
              fn({
                id: 'hillshade',
                title: 'World_Hillshade',
                type: 'feature',
                visible: true,
                geometryType: 'point',
                when () { return new Promise<void>(() => {}) },
                createQuery () { return {} },
                queryFeatures () { return Promise.resolve({ features: [] }) }
              })
              fn({
                id: 'places',
                title: 'Places',
                type: 'feature',
                visible: true,
                geometryType: 'point',
                createQuery () { return {} },
                queryFeatures () {
                  return Promise.resolve({
                    features: [{
                      attributes: { OBJECTID: 1, name: 'Library' },
                      geometry: { longitude: -71.06, latitude: 42.36 }
                    }]
                  })
                }
              })
            }
          }
        }
      }, 'map-1')
      await jest.advanceTimersByTimeAsync(8000)
      const snapshot = await pending

      expect(snapshot.sources.map((source) => source.displayName).sort()).toEqual(['Places'])
      expect(snapshot.records.map((record) => record.attributes.name)).toEqual(['Library'])
      expect(warn).toHaveBeenCalledWith('Audiom skipped a layer that did not finish loading', 'World_Hillshade')
      expect(error).not.toHaveBeenCalledWith('Audiom could not load layer', 'World_Hillshade', expect.anything())
    } finally {
      warn.mockRestore()
      error.mockRestore()
      jest.useRealTimers()
    }
  })

  it('drops a layer that reveals a raster type only after it loads', async () => {
    let queried = false
    const snapshot = await snapshotFeaturesFromMapView({
      map: {
        allLayers: {
          forEach (fn) {
            fn({
              id: 'hillshade',
              title: 'World_Hillshade',
              type: '',
              visible: true,
              when () {
                this.type = 'tile'
                return Promise.resolve()
              },
              createQuery () { return {} },
              queryFeatures () {
                queried = true
                return Promise.resolve({ features: [] })
              }
            })
            fn({
              id: 'places',
              title: 'Places',
              type: 'feature',
              visible: true,
              geometryType: 'point',
              createQuery () { return {} },
              queryFeatures () {
                return Promise.resolve({
                  features: [{
                    attributes: { OBJECTID: 1, name: 'Library' },
                    geometry: { longitude: -71.06, latitude: 42.36 }
                  }]
                })
              }
            })
          }
        }
      }
    }, 'map-1')

    expect(queried).toBe(false)
    expect(snapshot.records.map((record) => record.attributes.name)).toEqual(['Library'])
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
