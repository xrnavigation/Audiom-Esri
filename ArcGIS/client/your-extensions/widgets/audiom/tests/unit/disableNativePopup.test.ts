import { disableNativePopup, featureDetails, graphicIsRendered, graphicName, hitFeatureData, hitFeatureName, hitFeatureNames, renderedGraphic, resolvePopupTitle, roomUnderHit, type MountedMapView } from '../../src/runtime/esriMapSurface'

describe('disableNativePopup', () => {
  it('turns click-to-open off and closes one that is already open', () => {
    const closePopup = jest.fn()
    const view: MountedMapView = {
      popupEnabled: true,
      closePopup,
      popup: { visible: true }
    }

    disableNativePopup(view)

    expect(view.popupEnabled).toBe(false)
    expect(closePopup).toHaveBeenCalled()
  })

  it('closes through popup.close when the view has no closePopup', () => {
    const close = jest.fn()
    const view: MountedMapView = {
      popup: { visible: true, close }
    }

    disableNativePopup(view)

    expect(view.popupEnabled).toBe(false)
    expect(close).toHaveBeenCalled()
  })

  it('does nothing when the view has no popup', () => {
    expect(() => disableNativePopup({})).not.toThrow()
  })
})

describe('hitFeatureName', () => {
  it('uses the layer display field, then a name, and never the object id', () => {
    expect(hitFeatureName({
      attributes: { OBJECTID: 4, title: 'River Walk' },
      layer: { objectIdField: 'OBJECTID', displayField: 'title' }
    })).toBe('River Walk')
    expect(hitFeatureName({
      attributes: { OBJECTID: 4, Name: 'City Park' },
      layer: { objectIdField: 'OBJECTID' }
    })).toBe('City Park')
    expect(hitFeatureName({
      attributes: { OBJECTID: 9 },
      layer: { objectIdField: 'OBJECTID' }
    })).toBeNull()
    expect(hitFeatureName({
      attributes: { OBJECTID: 9 },
      layer: { objectIdField: 'OBJECTID', title: 'Parks' }
    })).toBe('Parks')
  })

  it('skips the avatar and repeats of the same name', () => {
    expect(hitFeatureNames({
      results: [
        { graphic: { attributes: { audiomAvatar: true, name: 'You' } } },
        { graphic: { attributes: { name: 'Trail' } } },
        { graphic: { attributes: { name: 'Trail' } } },
        { graphic: { attributes: { name: '  ' } } }
      ]
    })).toEqual(['Trail'])
  })
})

describe('resolvePopupTitle', () => {
  it('fills the layer popup title with attribute values', () => {
    expect(resolvePopupTitle({
      attributes: { PLOT: '12A', OWNER: 'Smith' },
      layer: { popupTemplate: { title: 'Plot {PLOT}' } }
    })).toBe('Plot 12A')
  })

  it('rejects an unresolved Arcade expression title', () => {
    expect(resolvePopupTitle({
      attributes: { PLOT: '12A' },
      layer: { popupTemplate: { title: '{expression/expr0}' } }
    })).toBeNull()
  })

  it('returns null without a popup template', () => {
    expect(resolvePopupTitle({ attributes: { PLOT: '12A' }, layer: { title: 'Layer' } })).toBeNull()
  })

  it('rejects a static title that is only the layer name', () => {
    expect(resolvePopupTitle({
      attributes: { PLOT: '12A' },
      layer: { popupTemplate: { title: 'percentImpervious_allMP_compare_raip' } }
    })).toBeNull()
  })
})

describe('graphicName', () => {
  it('uses a name-like string column when there is no standard name', () => {
    expect(graphicName({
      attributes: { OBJECTID: 7, MP_NAME: 'North Basin', percentImpervious: 42 },
      layer: { objectIdField: 'OBJECTID', title: 'percentImpervious_allMP_compare_raip' }
    })).toBe('North Basin')
  })

  it('falls back to any string column, never the layer title', () => {
    expect(graphicName({
      attributes: { OBJECTID: 7, watershed: 'Elk Creek', percentImpervious: 42 },
      layer: { objectIdField: 'OBJECTID', title: 'percentImpervious_allMP_compare_raip' }
    })).toBe('Elk Creek')
  })

  it('returns null when the feature has no string column', () => {
    expect(graphicName({
      attributes: { OBJECTID: 7, percentImpervious: 42 },
      layer: { objectIdField: 'OBJECTID', title: 'percentImpervious_allMP_compare_raip' }
    })).toBeNull()
  })
})

describe('hitFeatureData', () => {
  it('prefers the dynamic popup title and skips the avatar graphic', () => {
    expect(hitFeatureData({
      results: [
        { graphic: { attributes: { audiomAvatar: true } } },
        { graphic: { attributes: { NAME: 'Trailhead', val: 5 }, layer: { popupTemplate: { title: '{NAME}' } } } }
      ]
    })).toEqual({ name: 'Trailhead', attributes: { NAME: 'Trailhead', val: 5 } })
  })
})

describe('featureDetails', () => {
  it('queries the layer by object id for the hidden name column', async () => {
    const queryFeatures = jest.fn().mockResolvedValue({
      features: [{ attributes: { OBJECTID: 7, OWNER: 'CITY OF MANASSAS PARK', percentImpervious: 42 } }]
    })
    const details = await featureDetails({
      attributes: { OBJECTID: 7, percentImpervious: 42 },
      layer: { objectIdField: 'OBJECTID', title: 'percentImpervious_allMP_compare_raip', queryFeatures }
    })
    expect(queryFeatures).toHaveBeenCalledWith({ objectIds: [7], outFields: ['*'], returnGeometry: false })
    expect(details.name).toBe('CITY OF MANASSAS PARK')
    expect(details.attributes).toEqual({ OBJECTID: 7, OWNER: 'CITY OF MANASSAS PARK', percentImpervious: 42 })
  })

  it('keeps the hit-test attributes when the query is rejected', async () => {
    const details = await featureDetails({
      attributes: { OBJECTID: 7, percentImpervious: 42 },
      layer: { objectIdField: 'OBJECTID', queryFeatures: jest.fn().mockRejectedValue(new Error('denied')) }
    })
    expect(details.attributes).toEqual({ OBJECTID: 7, percentImpervious: 42 })
    expect(details.name).toBeNull()
  })
})

describe('roomUnderHit', () => {
  it('returns a painted heatmap parcel that has no use type', async () => {
    const details = await roomUnderHit({
      results: [
        { graphic: { attributes: { OBJECTID: 1 }, layer: { title: 'Imagery', renderer: { type: 'simple' } } } },
        {
          graphic: {
            attributes: { OBJECTID: 7, MP_NAME: 'North Basin', percentImpervious: 42 },
            layer: {
              objectIdField: 'OBJECTID',
              renderer: { type: 'class-breaks' },
              __audiomOriginalRenderer: { type: 'simple' }
            }
          }
        }
      ]
    })
    expect(details?.name).toBe('North Basin')
    expect(details?.attributes?.percentImpervious).toBe(42)
  })

  it('prefers the room under a floor polygon', async () => {
    const details = await roomUnderHit({
      results: [
        {
          graphic: {
            attributes: { USE_TYPE: 'Level', NAME: 'Level 1' },
            layer: { renderer: { type: 'simple' }, __audiomOriginalRenderer: {} }
          }
        },
        {
          graphic: {
            attributes: { USE_TYPE: 'Office', NAME: '201A' },
            layer: { renderer: { type: 'unique-value' } }
          }
        }
      ]
    })
    expect(details?.name).toBe('201A')
  })

  it('does not treat the floor catalog as a plot', async () => {
    const details = await roomUnderHit({
      results: [
        {
          graphic: {
            attributes: { USE_TYPE: 'Level', NAME: 'Level 1' },
            layer: { renderer: { type: 'simple' }, __audiomOriginalRenderer: {} }
          }
        }
      ]
    })
    expect(details).toBeNull()
  })
})

describe('graphicIsRendered', () => {
  it('accepts a feature Audiom painted and rejects the visual base layer', () => {
    expect(graphicIsRendered({
      attributes: { OBJECTID: 7 },
      layer: { __audiomOriginalRenderer: { type: 'simple' }, renderer: { type: 'class-breaks' } }
    })).toBe(true)
    expect(graphicIsRendered({
      attributes: { OBJECTID: 7 },
      layer: { renderer: { type: 'unique-value' } }
    })).toBe(true)
    expect(graphicIsRendered({
      attributes: { OBJECTID: 7 },
      layer: { renderer: { type: 'heatmap' } }
    })).toBe(true)
    expect(graphicIsRendered({
      attributes: { OBJECTID: 7, OWNER: 'CITY OF MANASSAS PARK' },
      layer: { title: 'Visual base', renderer: { type: 'simple' } }
    })).toBe(false)
    expect(graphicIsRendered({ attributes: { audiomAvatar: true }, layer: { __audiomOriginalRenderer: {} } })).toBe(false)
    expect(graphicIsRendered({ attributes: { OBJECTID: 1 } })).toBe(false)
  })

  it('picks the painted feature under a visual base graphic', () => {
    const painted = {
      attributes: { OBJECTID: 3, OWNER: 'AMERICAN BUILDING CORPORATION II' },
      layer: { __audiomOriginalRenderer: { type: 'simple' }, renderer: { type: 'class-breaks' } }
    }
    expect(renderedGraphic({
      results: [
        { graphic: { attributes: { audiomAvatar: true }, layer: { renderer: { type: 'simple' } } } },
        { graphic: { attributes: { OBJECTID: 1 }, layer: { title: 'Visual base', renderer: { type: 'simple' } } } },
        { graphic: painted }
      ]
    })).toBe(painted)
    expect(renderedGraphic({
      results: [
        { graphic: { attributes: { OBJECTID: 1 }, layer: { renderer: { type: 'simple' } } } }
      ]
    })).toBeNull()
  })
})
