/**
 * bundledMapViewpoint reads the selected web map's center and zoom in the
 * settings window. jimu-core and the logger are mocked; the REST path is
 * driven through a stubbed global.fetch.
 */
jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() })
}))

let mockState: unknown = {}
const mockGetItem = jest.fn()
const mockGetItemData = jest.fn()
const mockGetSessionByUrl = jest.fn()
const mockGetMainSession = jest.fn()

jest.mock('jimu-core', () => ({
  __esModule: true,
  getAppStore: () => ({ getState: () => mockState }),
  portalUrlUtils: {
    getPortalRestUrl: (url: string) => url.replace(/\/+$/, '').replace(/\/sharing$/i, '') + '/sharing/rest'
  },
  SessionManager: {
    getInstance: () => ({
      getSessionByUrl: (url: string) => mockGetSessionByUrl(url),
      getMainSession: () => mockGetMainSession()
    })
  },
  esri: {
    restPortal: {
      getItem: (...args: unknown[]) => mockGetItem(...args),
      getItemData: (...args: unknown[]) => mockGetItemData(...args)
    }
  }
}))

import {
  readBundledMapViewpoint,
  centerFromItemExtent,
  geographicCenter
} from '../../src/setting/bundledMapViewpoint'

const PORTAL = 'https://org.maps.arcgis.com/sharing/rest'

function stubFetch (meta: unknown, data: unknown): jest.Mock {
  const fetchMock = jest.fn((url: string) => {
    const body = url.includes('/data?f=json') ? data : meta
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
  })
  ;(global as unknown as { fetch: unknown }).fetch = fetchMock
  return fetchMock
}

describe('bundledMapViewpoint', () => {
  beforeEach(() => {
    mockState = {
      appConfig: {
        dataSources: { ds1: { itemId: 'item-1', portalUrl: PORTAL } }
      }
    }
    mockGetItem.mockReset()
    mockGetItemData.mockReset()
    mockGetSessionByUrl.mockReset()
    mockGetMainSession.mockReset()
    mockGetSessionByUrl.mockReturnValue(null)
    mockGetMainSession.mockReturnValue(null)
  })

  it('reads the WGS84 item extent midpoint as the center', async () => {
    const fetchMock = stubFetch(
      { title: 'My Map', extent: [[-100, 30], [-90, 40]] },
      { initialState: { viewpoint: { scale: 591657527.591555 / 32 } }, operationalLayers: [] }
    )
    const vp = await readBundledMapViewpoint('item-1')
    expect(vp?.centerLongitude).toBeCloseTo(-95, 5)
    expect(vp?.centerLatitude).toBeCloseTo(35, 5)
    expect(vp?.zoom).toBe(5)
    expect(vp?.title).toBe('My Map')
    expect(fetchMock).toHaveBeenCalledWith(`${PORTAL}/content/items/item-1?f=json`)
  })

  it('appends sharing/rest when the portal URL omits it', async () => {
    const fetchMock = stubFetch({ title: 'M', extent: [[-10, -10], [10, 10]] }, {})
    await readBundledMapViewpoint('item-1', 'https://org.maps.arcgis.com')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://org.maps.arcgis.com/sharing/rest/content/items/item-1?f=json'
    )
  })

  it('converts a Web Mercator viewpoint extent to geographic coordinates', () => {
    const center = geographicCenter({
      xmin: -11131949, ymin: 4865942, xmax: -10018754, ymax: 5465442,
      spatialReference: { wkid: 102100, latestWkid: 3857 }
    })
    expect(center?.longitude).toBeCloseTo(-95, 0)
    expect(center?.latitude).toBeCloseTo(42, 0)
  })

  it('reads a private item through the signed-in session when REST returns 403', async () => {
    ;(global as unknown as { fetch: unknown }).fetch = jest.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ error: { code: 403, messageCode: 'GWM_0003' } })
    }))
    const session = { token: 'signed-in' }
    mockGetSessionByUrl.mockReturnValue(session)
    mockGetItem.mockResolvedValue({
      title: 'Manassas Park Landuse from NAIP',
      extent: [[-77.47, 38.75], [-77.43, 38.79]]
    })
    mockGetItemData.mockResolvedValue({
      initialState: { viewpoint: { scale: 591657527.591555 / 4096 } },
      operationalLayers: [{
        id: 'group-1',
        title: 'Group',
        layers: [{
          id: '1a0b6077076-layer-4',
          title: 'percentImpervious_allMP_compare_naip',
          layerType: 'ArcGISFeatureLayer',
          url: 'https://gis.blueraster.io/server/rest/services/Hosted/percentImpervious_allMP_compare_naip/FeatureServer/0',
          visibility: true
        }, {
          id: 'image-1',
          title: 'NAIP imagery',
          layerType: 'ArcGISImageServiceLayer',
          url: 'https://gis.blueraster.io/server/rest/services/Hosted/naip/ImageServer',
          visibility: true
        }, {
          id: 'image-2',
          title: 'Second imagery',
          url: 'https://gis.blueraster.io/server/rest/services/Hosted/naip2/ImageServer',
          visibility: true
        }]
      }]
    })
    const vp = await readBundledMapViewpoint('item-1', 'https://org.maps.arcgis.com')
    expect(mockGetItem).toHaveBeenCalledWith('item-1', {
      portal: PORTAL,
      authentication: session
    })
    expect(vp?.title).toBe('Manassas Park Landuse from NAIP')
    expect(vp?.centerLongitude).toBeCloseTo(-77.45, 5)
    expect(vp?.centerLatitude).toBeCloseTo(38.77, 5)
    expect(vp?.zoom).toBe(12)
    expect(vp?.sourceConfigs).toEqual([{
      name: 'percentImpervious_allMP_compare_naip',
      source: '1a0b6077076-layer-4',
      sourceUrl: 'https://gis.blueraster.io/server/rest/services/Hosted/percentImpervious_allMP_compare_naip/FeatureServer/0',
      enabled: true
    }])
  })

  it('returns null when neither REST nor the signed-in session yields a center', async () => {
    ;(global as unknown as { fetch: unknown }).fetch = jest.fn(() => Promise.resolve({ ok: false }))
    const vp = await readBundledMapViewpoint('item-1', PORTAL)
    expect(vp).toBeNull()
  })
})
