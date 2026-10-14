import { disableNativePopup, featureDetails, graphicName, hitFeatureData, hitFeatureName, hitFeatureNames, resolvePopupTitle, type MountedMapView } from '../../src/runtime/esriMapSurface'

describe('disableNativePopup', () => {
  it('turns the Esri popup off and closes one that is already open', () => {
    const close = jest.fn()
    const view: MountedMapView = {
      popup: { enabled: true, autoOpenEnabled: true, visible: true, close }
    }

    disableNativePopup(view)

    expect(view.popup?.enabled).toBe(false)
    expect(view.popup?.autoOpenEnabled).toBe(false)
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
