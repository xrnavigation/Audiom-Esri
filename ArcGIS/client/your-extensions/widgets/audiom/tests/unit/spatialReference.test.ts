import {
  ESRI_ZOOM_0_SCALE,
  isWebMercatorViewpointWkid,
  isWebMercatorWkid,
  lonLatToWebMercator,
  webMercatorToLonLat,
  Wkid
} from '../../src/runtime/spatialReference'

describe('spatialReference', () => {
  it('keeps the drawn-view Web Mercator codes separate from the retired Google code', () => {
    expect(isWebMercatorWkid(Wkid.WebMercator)).toBe(true)
    expect(isWebMercatorWkid(Wkid.WebMercatorAuxSphere)).toBe(true)
    expect(isWebMercatorWkid(Wkid.WebMercatorOld)).toBe(true)
    expect(isWebMercatorWkid(Wkid.WebMercatorGoogle)).toBe(false)
    expect(isWebMercatorViewpointWkid(Wkid.WebMercatorGoogle)).toBe(true)
    expect(isWebMercatorWkid(Wkid.Wgs84)).toBe(false)
    expect(isWebMercatorWkid(undefined)).toBe(false)
  })

  it('converts Web Mercator meters and inverts that conversion', () => {
    expect(webMercatorToLonLat(0, 0)).toEqual({ longitude: 0, latitude: 0 })
    const geographic = webMercatorToLonLat(-10575293, 5160979)
    expect(geographic.longitude).toBeCloseTo(-95, 0)
    expect(geographic.latitude).toBeCloseTo(42, 0)
    const meters = lonLatToWebMercator(geographic.longitude, geographic.latitude)
    expect(meters.x).toBeCloseTo(-10575293, 0)
    expect(meters.y).toBeCloseTo(5160979, 0)
  })

  it('keeps the Esri zoom-0 scale that Map Settings divides by', () => {
    expect(Math.log2(ESRI_ZOOM_0_SCALE / (ESRI_ZOOM_0_SCALE / 32))).toBe(5)
  })
})