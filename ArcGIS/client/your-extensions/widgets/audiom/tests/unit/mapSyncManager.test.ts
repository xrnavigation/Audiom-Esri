/**
 * MapSyncManager exercises a lot of jimu-arcgis surface area. We jest.mock
 * the module so our fake JimuMapView / MapViewManager are used end-to-end.
 *
 * We mock at the top of the file (before the module under test imports
 * jimu-arcgis) so the production code's `import { MapViewManager } from
 * 'jimu-arcgis'` resolves to our stub.
 */
import { makeFakeJimuMapView, makeFakeMapViewManager, makeFakeLayer } from '../helpers/fakeJimuMapView'
import { makeSource } from '../helpers/configFactories'

let fakeJmv: ReturnType<typeof makeFakeJimuMapView>
let fakeManager: ReturnType<typeof makeFakeMapViewManager>

jest.mock('jimu-arcgis', () => ({
  __esModule: true,
  MapViewManager: { getInstance: () => fakeManager }
}))

// Mock mapUtils functions that touch the JSAPI directly. We don't care about
// real layer-extraction logic in these tests — we only want to verify the
// MapSyncManager's lifecycle (attach/detach/debounce/listener notification).
jest.mock('../../src/utils/mapUtils', () => {
  const actual = jest.requireActual('../../src/utils/mapUtils')
  return {
    ...actual,
    getJimuMapViewById: jest.fn(),
    extractMapConfigFromEsriMap: jest.fn()
  }
})

import { getJimuMapViewById, extractMapConfigFromEsriMap } from '../../src/utils/mapUtils'
import { getMapSyncManager, MapSyncManager } from '../../src/utils/mapSyncManager'

const NOTIFY_DEBOUNCE_MS = 100

describe('MapSyncManager', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    fakeJmv = makeFakeJimuMapView({ mapId: 'map-1' })
    fakeManager = makeFakeMapViewManager('map-1', fakeJmv)
    ;(getJimuMapViewById as jest.Mock).mockReset().mockReturnValue(fakeJmv)
    ;(extractMapConfigFromEsriMap as jest.Mock).mockReset().mockReturnValue({
      title: 'Map', centerLatitude: 0, centerLongitude: 0, zoom: 1,
      sourceConfigs: []
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('singleton registry', () => {
    it('returns the same instance for the same widget id', () => {
      const a = getMapSyncManager('w1')
      const b = getMapSyncManager('w1')
      expect(a).toBe(b)
    })

    it('returns distinct instances for different widget ids', () => {
      const a = getMapSyncManager('w-a-' + Math.random())
      const b = getMapSyncManager('w-b-' + Math.random())
      expect(a).not.toBe(b)
    })
  })

  describe('attach / detach', () => {
    let mgr: MapSyncManager
    beforeEach(() => {
      mgr = getMapSyncManager('attach-' + Math.random())
    })

    it('returns false and registers no listeners when no JimuMapView is available', () => {
      ;(getJimuMapViewById as jest.Mock).mockReturnValueOnce(undefined)
      expect(mgr.attach('map-1')).toBe(false)
      expect(fakeJmv._listenerCounts().created).toBe(0)
    })

    it('attaches layer / visibility listeners on success', () => {
      expect(mgr.attach('map-1')).toBe(true)
      const counts = fakeJmv._listenerCounts()
      expect(counts.created).toBe(1)
      expect(counts.removed).toBe(1)
      expect(counts.visibility).toBe(1)
    })

    it('detach removes all listeners', () => {
      mgr.attach('map-1')
      mgr.detach()
      const counts = fakeJmv._listenerCounts()
      expect(counts.created).toBe(0)
      expect(counts.removed).toBe(0)
      expect(counts.visibility).toBe(0)
    })

    it('re-attaching detaches the previous map first', () => {
      mgr.attach('map-1')
      const second = makeFakeJimuMapView({ mapId: 'map-2' })
      ;(getJimuMapViewById as jest.Mock).mockReturnValueOnce(second)
      mgr.attach('map-2')
      expect(fakeJmv._listenerCounts().created).toBe(0)
      expect(second._listenerCounts().created).toBe(1)
    })
  })

  describe('initial-sync tracking', () => {
    it('isInitialSyncDone is per-mapId and respects markInitialSyncDone / reset', () => {
      const mgr = getMapSyncManager('init-' + Math.random())
      expect(mgr.isInitialSyncDone('map-1')).toBe(false)
      mgr.markInitialSyncDone('map-1')
      expect(mgr.isInitialSyncDone('map-1')).toBe(true)
      expect(mgr.isInitialSyncDone('map-2')).toBe(false)
      mgr.resetInitialSync()
      expect(mgr.isInitialSyncDone('map-1')).toBe(false)
    })
  })

  describe('change notification', () => {
    let mgr: MapSyncManager

    beforeEach(() => {
      mgr = getMapSyncManager('notify-' + Math.random())
      mgr.attach('map-1')
    })

    afterEach(() => {
      mgr.detach()
    })

    it('debounces a rapid burst of layer events into a single notification', () => {
      const listener = jest.fn()
      mgr.addChangeListener(listener)

      // Simulate the map config changing so the diff fires
      ;(extractMapConfigFromEsriMap as jest.Mock).mockReturnValue({
        title: 'Map', centerLatitude: 0, centerLongitude: 0, zoom: 2,
        sourceConfigs: [makeSource({ source: 'new' })]
      })

      fakeJmv._fireLayerCreated(makeFakeLayer())
      fakeJmv._fireLayerCreated(makeFakeLayer())
      fakeJmv._fireVisibilityChanged([makeFakeLayer()])
      expect(listener).not.toHaveBeenCalled()

      jest.advanceTimersByTime(NOTIFY_DEBOUNCE_MS)
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('does not re-notify when the underlying config has not changed (json identity)', () => {
      const listener = jest.fn()
      mgr.addChangeListener(listener)

      // First burst — config changes from baseline
      ;(extractMapConfigFromEsriMap as jest.Mock).mockReturnValue({
        title: 'Map', zoom: 9, centerLatitude: 0, centerLongitude: 0,
        sourceConfigs: []
      })
      fakeJmv._fireVisibilityChanged([makeFakeLayer()])
      jest.advanceTimersByTime(NOTIFY_DEBOUNCE_MS)
      expect(listener).toHaveBeenCalledTimes(1)

      // Second burst with identical config — should be skipped
      fakeJmv._fireVisibilityChanged([makeFakeLayer()])
      jest.advanceTimersByTime(NOTIFY_DEBOUNCE_MS)
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('removeChangeListener prevents subsequent notifications', () => {
      const listener = jest.fn()
      mgr.addChangeListener(listener)
      mgr.removeChangeListener(listener)

      ;(extractMapConfigFromEsriMap as jest.Mock).mockReturnValue({
        title: 't', zoom: 3, centerLatitude: 1, centerLongitude: 2,
        sourceConfigs: []
      })
      fakeJmv._fireLayerCreated(makeFakeLayer())
      jest.advanceTimersByTime(NOTIFY_DEBOUNCE_MS)
      expect(listener).not.toHaveBeenCalled()
    })

    it('a throwing listener does not stop other listeners', () => {
      const bad = jest.fn(() => { throw new Error('boom') })
      const good = jest.fn()
      mgr.addChangeListener(bad)
      mgr.addChangeListener(good)

      ;(extractMapConfigFromEsriMap as jest.Mock).mockReturnValue({
        title: 'x', zoom: 7, centerLatitude: 0, centerLongitude: 0,
        sourceConfigs: []
      })
      fakeJmv._fireLayerCreated(makeFakeLayer())
      jest.advanceTimersByTime(NOTIFY_DEBOUNCE_MS)
      expect(bad).toHaveBeenCalled()
      expect(good).toHaveBeenCalled()
    })
  })

  describe('hasChanges', () => {
    it('returns false when not initialized', () => {
      const mgr = getMapSyncManager('hc-' + Math.random())
      expect(mgr.hasChanges('map-1', { sourceConfigs: [] })).toBe(false)
    })

    it('returns true when locked source diff differs', () => {
      ;(extractMapConfigFromEsriMap as jest.Mock).mockReturnValue({
        title: 't', zoom: 1, centerLatitude: 0, centerLongitude: 0,
        sourceConfigs: [makeSource({ source: 'fresh-from-map' })]
      })
      const mgr = getMapSyncManager('hc-true-' + Math.random())
      mgr.attach('map-1', { sourceConfigs: [makeSource({ source: 'old-locked' })] })
      expect(mgr.hasChanges('map-1', { sourceConfigs: [makeSource({ source: 'old-locked' })] })).toBe(true)
      mgr.detach()
    })

    it('returns false when only unlocked sources differ (they are excluded)', () => {
      ;(extractMapConfigFromEsriMap as jest.Mock).mockReturnValue({
        title: 't', zoom: 1, centerLatitude: 0, centerLongitude: 0,
        sourceConfigs: [makeSource({ source: 'a' })]
      })
      const widgetCfg = {
        sourceConfigs: [
          makeSource({ source: 'a' }),
          makeSource({ source: 'unlocked-only', locked: false })
        ]
      }
      const mgr = getMapSyncManager('hc-unlocked-' + Math.random())
      mgr.attach('map-1', widgetCfg)
      expect(mgr.hasChanges('map-1', widgetCfg)).toBe(false)
      mgr.detach()
    })
  })
})
