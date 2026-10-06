/**
 * Runtime widget integration tests.
 *
 * Strategy:
 * - Stub `jimu-arcgis` so JimuMapViewComponent renders nothing and we don't
 *   pull the JSAPI into jsdom.
 * - Stub `mapSyncManager` so the widget's effect doesn't try to reach
 *   real map state — we control change-listener invocation directly.
 * - Use `wrapWidget` + `widgetRender` from jimu-for-test so Redux store,
 *   theme, and intl providers are wired up like the runtime.
 */
import { React, getAppStore, type ImmutableArray } from 'jimu-core'

jest.mock('jimu-arcgis', () => ({
  __esModule: true,
  JimuMapViewComponent: (): null => null,
  MapViewManager: { getInstance: (): undefined => undefined }
}))

const fakeManager = {
  attach: jest.fn().mockReturnValue(true),
  detach: jest.fn(),
  resetInitialSync: jest.fn(),
  isInitialSyncDone: jest.fn().mockReturnValue(false),
  markInitialSyncDone: jest.fn(),
  getCurrentConfig: jest.fn().mockReturnValue(null),
  hasChanges: jest.fn().mockReturnValue(false),
  addChangeListener: jest.fn(),
  removeChangeListener: jest.fn()
}

jest.mock('../../src/utils/mapSyncManager', () => ({
  __esModule: true,
  AUTO_SYNC_LAYERS: true,
  getMapSyncManager: () => fakeManager
}))

import { widgetRender, wrapWidget } from 'jimu-for-test'
import _Widget from '../../src/runtime/widget'
import { JimuConfig } from '../../src/utils/JimuConfig'
import { makeImmutableConfig } from '../helpers/configFactories'
import { RuntimeLocation } from '../../src/setting/runtimeLocation'
import { setMapModuleLoader } from '../../src/runtime/esriMapSurface'

const render = widgetRender()

function setBuilder(value: boolean) {
  ;(JimuConfig as any).instance = null
  ;(window as any).jimuConfig = { ...(window as any).jimuConfig, isInBuilder: value }
}

describe('Audiom runtime widget', () => {
  beforeEach(() => {
    Object.values(fakeManager).forEach(v => {
      if (typeof v === 'function' && (v as any).mockClear) (v as any).mockClear()
    })
    fakeManager.attach.mockReturnValue(true)
    fakeManager.hasChanges.mockReturnValue(false)
    setBuilder(false)
  })

  it('renders an iframe with the embed URL', () => {
    const Widget = wrapWidget(_Widget, { config: makeImmutableConfig({ apiKey: 'k' }) as any })
    const { container } = render(<Widget widgetId="audiom-1" />)
    const iframe = container.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe!.getAttribute('src')!.startsWith('https://')).toBe(true)
    expect(iframe!.getAttribute('name')).toBe('audiom')
  })

  it('locks down the iframe with a strict sandbox and no-referrer policy (security)', () => {
    const Widget = wrapWidget(_Widget, { config: makeImmutableConfig() as any })
    const { container } = render(<Widget widgetId="audiom-2" />)
    const iframe = container.querySelector('iframe')!
    const sandbox = iframe.getAttribute('sandbox')!.split(/\s+/)
    expect(sandbox).toEqual(expect.arrayContaining([
      'allow-scripts',
      'allow-same-origin',
      'allow-popups',
      'allow-popups-to-escape-sandbox',
      'allow-forms'
    ]))
    expect(sandbox).not.toContain('allow-top-navigation')
    expect(iframe.getAttribute('referrerPolicy')).toBe('no-referrer')
  })

  it('uses the config title as iframe title when provided', () => {
    const Widget = wrapWidget(_Widget, { config: makeImmutableConfig({ title: 'My Map' }) as any })
    const { container } = render(<Widget widgetId="audiom-3" />)
    const iframe = container.querySelector('iframe')!
    expect(iframe.getAttribute('title')).toBe('My Map')
  })

  it('renders no message popup when there are no detected changes', () => {
    const Widget = wrapWidget(_Widget, { config: makeImmutableConfig() as any })
    const { queryByRole } = render(<Widget widgetId="audiom-4" />)
    expect(queryByRole('alert')).toBeNull()
  })

  it('does not attach to the map when useExistingMap is false', () => {
    const Widget = wrapWidget(_Widget, {
      config: makeImmutableConfig({ useExistingMap: false }) as any
    })
    render(<Widget widgetId="audiom-5" />)
    expect(fakeManager.attach).not.toHaveBeenCalled()
  })

  it('attaches the MapSyncManager when useExistingMap is true and existingMapId is set', () => {
    const Widget = wrapWidget(_Widget, {
      config: makeImmutableConfig({ useExistingMap: true, existingMapId: 'map-w' }) as any
    })
    render(<Widget widgetId="audiom-6" />)
    expect(fakeManager.attach).toHaveBeenCalledWith('map-w', expect.anything())
    expect(fakeManager.addChangeListener).toHaveBeenCalled()
  })

  it('removes the change listener on unmount', () => {
    const Widget = wrapWidget(_Widget, {
      config: makeImmutableConfig({ useExistingMap: true, existingMapId: 'map-w' }) as any
    })
    const { unmount } = render(<Widget widgetId="audiom-7" />)
    unmount()
    expect(fakeManager.removeChangeListener).toHaveBeenCalled()
  })

  it('renders an Esri map in the widget for bundled mode', async () => {
    const created: Array<{ container: HTMLElement, map: unknown }> = []
    setMapModuleLoader(async (modules) => {
      if (modules[0] === 'esri/layers/GraphicsLayer') {
        return [class GraphicsLayer {
          constructor (public properties: unknown) {}
          removeAll () {}
          add () {}
        }]
      }
      return [
      class Map { constructor (public properties: unknown) {} },
      class MapView {
        container: HTMLElement
        map: unknown
        constructor (properties: { container: HTMLElement, map: unknown }) {
          this.container = properties.container
          this.map = properties.map
          created.push(properties)
          properties.container.dataset.mapMounted = 'true'
        }
        destroy () {}
      }
    ]
    })

    const Widget = wrapWidget(_Widget, {
      config: makeImmutableConfig({
        runtimeLocation: RuntimeLocation.Bundled,
        mapItemId: 'item-1'
      }) as any,
      useMapWidgetIds: ['external-map'] as unknown as ImmutableArray<string>
    })
    const { container, unmount } = render(<Widget widgetId="audiom-bundled" />)
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('button')).toBeNull()
    const map = container.querySelector('#audiom-esri-map')
    expect(map).not.toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(map!.getAttribute('data-map-mounted')).toBe('true')
    expect(map!.getAttribute('tabindex')).toBe('0')
    unmount()
    expect(created.length).toBe(1)
    expect((created[0].map as { properties: { portalItem?: { id: string } } }).properties.portalItem?.id).toBe('item-1')
    setMapModuleLoader(null)
  })

  it('loads a bundled web map from the data source portal, not the app portal', async () => {
    const created: Array<{ map: { properties: { portalItem?: { id: string, portal?: { url?: string } } } } }> = []
    setMapModuleLoader(async (modules) => {
      if (modules[0] === 'esri/layers/GraphicsLayer') {
        return [class GraphicsLayer {
          constructor (public properties: unknown) {}
          removeAll () {}
          add () {}
        }]
      }
      class Portal {
        url: string
        loaded = false
        constructor (properties: { url: string }) { this.url = properties.url }
        async load () { this.loaded = true }
      }
      class PortalItem {
        id: string
        portal: { url?: string }
        constructor (properties: { id: string, portal: { url?: string } }) {
          this.id = properties.id
          this.portal = properties.portal
        }
      }
      return [
        class Map { constructor (public properties: unknown) {} },
        class MapView {
          constructor (properties: { container: HTMLElement, map: { properties: { portalItem?: { id: string, portal?: { url?: string } } } } }) {
            created.push(properties)
            properties.container.dataset.mapMounted = 'true'
          }
          destroy () {}
        },
        Portal,
        PortalItem
      ]
    })

    const Widget = wrapWidget(_Widget, {
      config: makeImmutableConfig({
        runtimeLocation: RuntimeLocation.Bundled,
        mapItemId: 'item-1'
      }) as any,
      useDataSources: [{ dataSourceId: 'dataSource_2', mainDataSourceId: 'dataSource_2' }] as any
    })
    const store = getAppStore() as unknown as { getState: () => unknown, dispatch: () => void }
    const state = store.getState() as { appConfig?: { dataSources?: Record<string, unknown> } }
    const previous = state.appConfig
    state.appConfig = {
      ...previous,
      dataSources: {
        dataSource_2: {
          itemId: 'item-1',
          portalUrl: 'https://data.example.com'
        }
      }
    }
    const { container, unmount } = render(<Widget widgetId="audiom-portal" />)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const item = created[0]?.map.properties.portalItem
    expect(item?.id).toBe('item-1')
    expect(item?.portal?.url).toBe('https://data.example.com')
    expect(container.querySelector('#audiom-esri-map')!.getAttribute('data-map-mounted')).toBe('true')
    unmount()
    state.appConfig = previous
    setMapModuleLoader(null)
  })

  it('appends visual base layer position as JSON, not "[object Object]"', () => {
    const Widget = wrapWidget(_Widget, {
      config: makeImmutableConfig({
        visualBaseLayers: [{
          url: 'https://x/img.png',
          position: '[[-1,1],[1,1],[1,-1],[-1,-1]]'
        }]
      }) as any
    })
    const { container } = render(<Widget widgetId="audiom-position" />)
    const src = container.querySelector('iframe')!.getAttribute('src')!
    expect(src).toContain('visualbaselayerposition0=')
    expect(src).toContain(encodeURIComponent('[[-1,1],[1,1],[1,-1],[-1,-1]]'))
    expect(src).not.toContain('[object Object]')
    expect(src).not.toContain(encodeURIComponent('[object Object]'))
  })

  it('encodes user-supplied title in the iframe src (no script tag injection)', () => {
    const Widget = wrapWidget(_Widget, {
      config: makeImmutableConfig({ title: '<script>alert(1)</script>' }) as any
    })
    const { container } = render(<Widget widgetId="audiom-8" />)
    const src = container.querySelector('iframe')!.getAttribute('src')!
    expect(src).not.toContain('<script>')
  })
})
