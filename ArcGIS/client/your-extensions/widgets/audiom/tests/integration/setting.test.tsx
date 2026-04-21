/**
 * Setting panel smoke / integration tests.
 *
 * The settings panel is a substantial component that wires together the
 * MapWidgetSelector, source list, lockable fields, and MapSyncManager.
 * Full UI coverage of every control belongs in component-level tests; this
 * suite exercises the wiring around `props.onSettingChange` and the map
 * sync lifecycle, which is the riskiest area.
 */
import { React } from 'jimu-core'

jest.mock('jimu-arcgis', () => ({
  __esModule: true,
  JimuMapViewComponent: (): null => null,
  MapViewManager: { getInstance: (): undefined => undefined }
}))

/**
 * `jimu-ui/advanced/setting-components` (specifically MapWidgetSelector)
 * reaches into `state.appStateInBuilder.appConfig` to build its dropdown
 * of available map widgets. Setting that up properly in jsdom would
 * pull in nearly the entire builder. Stub the small surface we use so
 * the panel renders and our own onSettingChange wiring is what gets
 * exercised.
 */
jest.mock('jimu-ui/advanced/setting-components', () => {
  const React = require('jimu-core').React
  const passthrough = (p: any) => React.createElement('div', null, p?.children)
  return {
    __esModule: true,
    MapWidgetSelector: (p: any) => React.createElement('div', {
      'data-testid': 'map-widget-selector',
      onClick: () => p.onSelect?.(['picked-map'])
    }),
    SettingSection: passthrough,
    SettingRow: passthrough
  }
})

/**
 * jimu-ui pulls in heavy DOM/style dependencies that don't initialise
 * cleanly under jsdom (Tooltip / Collapse / NumericInput each instantiate
 * their own theming + measurement code). Replace them with minimal
 * functional components — we are testing audiom's wiring, not jimu-ui.
 */
jest.mock('jimu-ui', () => {
  const React = require('jimu-core').React
  const passthrough = (p: any) => React.createElement('div', null, p?.children)
  const inputLike = (p: any) => React.createElement('input', {
    onChange: (e: any) => p.onChange?.(e?.target?.value),
    value: p?.value ?? ''
  })
  return {
    __esModule: true,
    NumericInput: inputLike,
    Switch: (p: any) => React.createElement('input', {
      type: 'checkbox',
      checked: !!p.checked,
      onChange: (e: any) => p.onChange?.(e?.target?.checked, e)
    }),
    Button: (p: any) => React.createElement('button', { onClick: p.onClick }, p?.children),
    ButtonGroup: passthrough,
    Collapse: (p: any) => React.createElement('div', null, p?.isOpen ? p?.children : null),
    Tooltip: passthrough,
    Label: passthrough,
    Select: inputLike,
    Option: (p: any) => React.createElement('option', null, p?.children),
    TextInput: inputLike
  }
})

/**
 * Audiom's own setting subcomponents pull in jimu-ui transitively as well
 * as react-dnd surfaces. Stub them to placeholders.
 */
jest.mock('../../src/setting/components/SourceConfigList', () => ({
  __esModule: true, default: (): null => null
}))
jest.mock('../../src/setting/components/VisualBaseLayerList', () => ({
  __esModule: true, default: (): null => null
}))
jest.mock('../../src/setting/components/FieldRenderer', () => ({
  __esModule: true, default: (): null => null
}))
jest.mock('../../src/setting/components/CollapsibleHeader', () => ({
  __esModule: true,
  default: ({ children }: any) => children ?? null
}))
jest.mock('../../src/setting/components/CopyableLabel', () => ({
  __esModule: true, default: (): null => null
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

import { widgetSettingRender, wrapWidgetSetting } from 'jimu-for-test'
import _Setting from '../../src/setting/setting'
import { makeImmutableConfig } from '../helpers/configFactories'

const render = widgetSettingRender()

describe('Audiom setting panel', () => {
  beforeEach(() => {
    Object.values(fakeManager).forEach(v => {
      if (typeof v === 'function' && (v as any).mockClear) (v as any).mockClear()
    })
    fakeManager.attach.mockReturnValue(true)
    fakeManager.isInitialSyncDone.mockReturnValue(false)
  })

  it('mounts without throwing', () => {
    const Setting = wrapWidgetSetting(_Setting, {
      config: makeImmutableConfig() as any,
      onSettingChange: jest.fn()
    } as any)
    const { container } = render(<Setting widgetId="audiom-set-1" />)
    expect(container.firstChild).not.toBeNull()
  })

  it('does not attach the MapSyncManager when useExistingMap is false', () => {
    const Setting = wrapWidgetSetting(_Setting, {
      config: makeImmutableConfig({ useExistingMap: false }) as any,
      onSettingChange: jest.fn()
    } as any)
    render(<Setting widgetId="audiom-set-2" />)
    expect(fakeManager.detach).toHaveBeenCalled()
    expect(fakeManager.attach).not.toHaveBeenCalled()
  })

  it('attaches and performs initial sync when useExistingMap is true with a map id', () => {
    fakeManager.getCurrentConfig.mockReturnValue({
      title: 't', zoom: 1, centerLatitude: 0, centerLongitude: 0, sourceConfigs: []
    })
    const onSettingChange = jest.fn()
    const Setting = wrapWidgetSetting(_Setting, {
      config: makeImmutableConfig({ useExistingMap: true, existingMapId: 'map-w' }) as any,
      onSettingChange,
      useMapWidgetIds: ['map-w']
    } as any)
    render(<Setting widgetId="audiom-set-3" />)
    expect(fakeManager.attach).toHaveBeenCalledWith('map-w', expect.anything())
    expect(fakeManager.markInitialSyncDone).toHaveBeenCalledWith('map-w')
    expect(fakeManager.addChangeListener).toHaveBeenCalled()
  })

  it('skips initial sync when isInitialSyncDone reports true (replaces only listener)', () => {
    fakeManager.isInitialSyncDone.mockReturnValue(true)
    const onSettingChange = jest.fn()
    const Setting = wrapWidgetSetting(_Setting, {
      config: makeImmutableConfig({ useExistingMap: true, existingMapId: 'map-w' }) as any,
      onSettingChange,
      useMapWidgetIds: ['map-w']
    } as any)
    render(<Setting widgetId="audiom-set-4" />)
    expect(fakeManager.attach).not.toHaveBeenCalled()
    expect(fakeManager.addChangeListener).toHaveBeenCalled()
  })

  it('removes the change listener on unmount', () => {
    const Setting = wrapWidgetSetting(_Setting, {
      config: makeImmutableConfig({ useExistingMap: true, existingMapId: 'map-w' }) as any,
      onSettingChange: jest.fn(),
      useMapWidgetIds: ['map-w']
    } as any)
    const { unmount } = render(<Setting widgetId="audiom-set-5" />)
    unmount()
    expect(fakeManager.removeChangeListener).toHaveBeenCalled()
  })

  it('auto-syncs existingMapId when props.useMapWidgetIds differs from config', () => {
    const onSettingChange = jest.fn()
    const Setting = wrapWidgetSetting(_Setting, {
      config: makeImmutableConfig({ useExistingMap: true, existingMapId: '' }) as any,
      onSettingChange,
      useMapWidgetIds: ['fresh-map']
    } as any)
    render(<Setting widgetId="audiom-set-6" />)
    // First call should be the existingMapId backfill from useMapWidgetIds
    const setExistingMapIdCall = onSettingChange.mock.calls.find(
      ([arg]) => (arg.config as any)?.existingMapId === 'fresh-map'
    )
    expect(setExistingMapIdCall).toBeDefined()
  })

  describe('runtimeAutoSync checkbox', () => {
    it('renders the checkbox when useExistingMap is true', () => {
      const Setting = wrapWidgetSetting(_Setting, {
        config: makeImmutableConfig({ useExistingMap: true, existingMapId: 'map-w' }) as any,
        onSettingChange: jest.fn(),
        useMapWidgetIds: ['map-w']
      } as any)
      const { container } = render(<Setting widgetId="audiom-set-runtime-1" />)
      // The "Sync layer visibility at runtime" Switch is the second checkbox
      // (the first is the "Use Existing Map Widget" toggle).
      const checkboxes = container.querySelectorAll('input[type="checkbox"]')
      expect(checkboxes.length).toBeGreaterThanOrEqual(2)
    })

    it('does not render the checkbox when useExistingMap is false', () => {
      const Setting = wrapWidgetSetting(_Setting, {
        config: makeImmutableConfig({ useExistingMap: false }) as any,
        onSettingChange: jest.fn()
      } as any)
      const { container } = render(<Setting widgetId="audiom-set-runtime-2" />)
      // Only the "Use Existing Map Widget" toggle is present.
      const checkboxes = container.querySelectorAll('input[type="checkbox"]')
      expect(checkboxes.length).toBe(1)
    })

    it('reflects the config value (defaults to true)', () => {
      const Setting = wrapWidgetSetting(_Setting, {
        // omit runtimeAutoSync → falls back to DEFAULT_CONFIG.runtimeAutoSync (true)
        config: makeImmutableConfig({ useExistingMap: true, existingMapId: 'map-w' }) as any,
        onSettingChange: jest.fn(),
        useMapWidgetIds: ['map-w']
      } as any)
      const { container } = render(<Setting widgetId="audiom-set-runtime-3" />)
      const checkboxes = container.querySelectorAll('input[type="checkbox"]')
      // The runtime-sync switch is the second checkbox.
      expect((checkboxes[1] as HTMLInputElement).checked).toBe(true)
    })

    it('reflects an explicit `false` config value', () => {
      const Setting = wrapWidgetSetting(_Setting, {
        config: makeImmutableConfig({
          useExistingMap: true,
          existingMapId: 'map-w',
          runtimeAutoSync: false
        }) as any,
        onSettingChange: jest.fn(),
        useMapWidgetIds: ['map-w']
      } as any)
      const { container } = render(<Setting widgetId="audiom-set-runtime-4" />)
      const checkboxes = container.querySelectorAll('input[type="checkbox"]')
      expect((checkboxes[1] as HTMLInputElement).checked).toBe(false)
    })
  })
})
