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
import { React } from 'jimu-core'

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
import { makeConfig } from '../helpers/configFactories'

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
    const Widget = wrapWidget(_Widget, { config: makeConfig({ apiKey: 'k' }) as any })
    const { container } = render(<Widget widgetId="audiom-1" />)
    const iframe = container.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe!.getAttribute('src')!.startsWith('https://')).toBe(true)
    expect(iframe!.getAttribute('name')).toBe('audiom')
  })

  it('locks down the iframe with a strict sandbox and no-referrer policy (security)', () => {
    const Widget = wrapWidget(_Widget, { config: makeConfig() as any })
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
    const Widget = wrapWidget(_Widget, { config: makeConfig({ title: 'My Map' }) as any })
    const { container } = render(<Widget widgetId="audiom-3" />)
    const iframe = container.querySelector('iframe')!
    expect(iframe.getAttribute('title')).toBe('My Map')
  })

  it('renders no message popup when there are no detected changes', () => {
    const Widget = wrapWidget(_Widget, { config: makeConfig() as any })
    const { queryByRole } = render(<Widget widgetId="audiom-4" />)
    expect(queryByRole('alert')).toBeNull()
  })

  it('does not attach to the map when useExistingMap is false', () => {
    const Widget = wrapWidget(_Widget, {
      config: makeConfig({ useExistingMap: false }) as any
    })
    render(<Widget widgetId="audiom-5" />)
    expect(fakeManager.attach).not.toHaveBeenCalled()
  })

  it('attaches the MapSyncManager when useExistingMap is true and existingMapId is set', () => {
    const Widget = wrapWidget(_Widget, {
      config: makeConfig({ useExistingMap: true, existingMapId: 'map-w' }) as any
    })
    render(<Widget widgetId="audiom-6" />)
    expect(fakeManager.attach).toHaveBeenCalledWith('map-w', expect.anything())
    expect(fakeManager.addChangeListener).toHaveBeenCalled()
  })

  it('removes the change listener on unmount', () => {
    const Widget = wrapWidget(_Widget, {
      config: makeConfig({ useExistingMap: true, existingMapId: 'map-w' }) as any
    })
    const { unmount } = render(<Widget widgetId="audiom-7" />)
    unmount()
    expect(fakeManager.removeChangeListener).toHaveBeenCalled()
  })

  it('encodes user-supplied title in the iframe src (no script tag injection)', () => {
    const Widget = wrapWidget(_Widget, {
      config: makeConfig({ title: '<script>alert(1)</script>' }) as any
    })
    const { container } = render(<Widget widgetId="audiom-8" />)
    const src = container.querySelector('iframe')!.getAttribute('src')!
    expect(src).not.toContain('<script>')
  })
})
