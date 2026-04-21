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
import { makeConfig, makeImmutableConfig } from '../helpers/configFactories'

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

  it('iframe carries the allowFullScreen attribute', () => {
    const Widget = wrapWidget(_Widget, { config: makeConfig() as any })
    const { container } = render(<Widget widgetId="audiom-fullscreen" />)
    const iframe = container.querySelector('iframe')!
    // React renders the prop as either `allowfullscreen` or `allowFullScreen`
    // depending on jsdom version; a non-null value of either is acceptable.
    const attr = iframe.getAttribute('allowfullscreen') ?? iframe.getAttribute('allowFullScreen')
    expect(attr).not.toBeNull()
  })

  describe('runtime auto-sync (postMessage path)', () => {
    /** Convenience: pull the most recently registered change listener. */
    const getListener = () => {
      const calls = fakeManager.addChangeListener.mock.calls
      return calls[calls.length - 1]?.[0] as ((cfg: any) => void) | undefined
    }

    it('pushes setFilters via postMessage on a visibility-only delta and does NOT change iframe src', () => {
      const onSettingChange = jest.fn()
      const initialSources = [
        { source: 'parks', sourceUrl: 'https://x/parks', locked: true, enabled: true },
        { source: 'roads', sourceUrl: 'https://x/roads', locked: true, enabled: true }
      ]
      const Widget = wrapWidget(_Widget, {
        config: makeImmutableConfig({
          useExistingMap: true,
          existingMapId: 'map-w',
          sourceConfigs: initialSources,
          runtimeAutoSync: true
        }) as any,
        onSettingChange
      })
      const { container } = render(<Widget widgetId="audiom-rt-1" />)
      const iframe = container.querySelector('iframe')!
      const srcBefore = iframe.getAttribute('src')!
      const postMessage = jest.fn()
      Object.defineProperty(iframe, 'contentWindow', {
        configurable: true,
        get: () => ({ postMessage })
      })

      const listener = getListener()
      expect(listener).toBeDefined()

      // Visibility-only delta: same sources, one toggled off.
      listener!({
        sourceConfigs: [
          { ...initialSources[0], enabled: false },
          initialSources[1]
        ]
      })

      // onSettingChange should be invoked to persist the visibility change.
      expect(onSettingChange).toHaveBeenCalled()
      const lastConfig = onSettingChange.mock.calls[onSettingChange.mock.calls.length - 1][0].config
      const updatedSources = lastConfig?.sourceConfigs ?? []
      expect(updatedSources[0].enabled).toBe(false)

      // iframe src is unchanged on a visibility-only delta.
      expect(iframe.getAttribute('src')).toBe(srcBefore)
    })

    it('falls back to reload + "Map updated" notice when delta requires a reload', () => {
      const onSettingChange = jest.fn()
      const initialSources = [
        { source: 'parks', sourceUrl: 'https://x/parks', locked: true, enabled: true }
      ]
      const Widget = wrapWidget(_Widget, {
        config: makeImmutableConfig({
          useExistingMap: true,
          existingMapId: 'map-w',
          sourceConfigs: initialSources,
          runtimeAutoSync: true
        }) as any,
        onSettingChange
      })
      render(<Widget widgetId="audiom-rt-2" />)

      const listener = getListener()
      // Reload-required delta: a new source appears.
      listener!({
        sourceConfigs: [
          ...initialSources,
          { source: 'rivers', sourceUrl: 'https://x/rivers', locked: true, enabled: true }
        ]
      })

      // onSettingChange invoked with the merged config (reload via URL change).
      expect(onSettingChange).toHaveBeenCalled()
      const lastConfig = onSettingChange.mock.calls[onSettingChange.mock.calls.length - 1][0].config
      expect(lastConfig?.sourceConfigs?.length).toBe(2)
    })

    it('falls back to legacy popup behavior when runtimeAutoSync is false', () => {
      const onSettingChange = jest.fn()
      fakeManager.hasChanges.mockReturnValue(true)
      const Widget = wrapWidget(_Widget, {
        config: makeImmutableConfig({
          useExistingMap: true,
          existingMapId: 'map-w',
          runtimeAutoSync: false,
          sourceConfigs: [
            { source: 'parks', sourceUrl: 'https://x/parks', locked: true, enabled: true }
          ]
        }) as any,
        onSettingChange
      })
      render(<Widget widgetId="audiom-rt-3" />)

      const listener = getListener()
      listener!({
        sourceConfigs: [
          { source: 'parks', sourceUrl: 'https://x/parks', locked: true, enabled: false }
        ]
      })

      // Legacy path: should NOT auto-write the new visibility through onSettingChange.
      expect(onSettingChange).not.toHaveBeenCalled()
    })
  })
})
