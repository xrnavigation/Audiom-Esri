/**
 * Setting panel smoke / integration tests.
 *
 * The settings panel is a substantial component that wires together the
 * MapWidgetSelector, source list, lockable fields, and MapSyncManager.
 * Full UI coverage of every control belongs in component-level tests; this
 * suite exercises the wiring around `props.onSettingChange` and the map
 * sync lifecycle, which is the riskiest area.
 */
import { React, getAppStore } from 'jimu-core'

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
  const { createSettingComponentsStubs } = require('../helpers/stubComponents')
  return createSettingComponentsStubs()
})

jest.mock('jimu-ui/advanced/data-source-selector', () => {
  const React = require('react')
  return {
    __esModule: true,
    AllDataSourceTypes: { WebMap: 'WEB_MAP', WebScene: 'WEB_SCENE' },
    DataSourceSelector: (props: Record<string, unknown>): React.ReactElement =>
      React.createElement('div', {
        'data-testid': 'map-source-selector',
        'data-must-use': String(Boolean(props.mustUseDataSource)),
        'data-enabled': String(Boolean(props.useDataSourcesEnabled)),
        onClick: () => {
          const onChange = props.onChange as ((sources: unknown[]) => void) | undefined
          onChange?.([{ dataSourceId: 'dataSource_2', mainDataSourceId: 'dataSource_2' }])
        }
      })
  }
})

/**
 * jimu-ui pulls in heavy DOM/style dependencies that don't initialise
 * cleanly under jsdom (Tooltip / Collapse / NumericInput each instantiate
 * their own theming + measurement code). Replace them with minimal
 * functional components — we are testing audiom's wiring, not jimu-ui.
 */
jest.mock('jimu-ui', () => {
  const { createJimuUiStubs } = require('../helpers/stubComponents')
  return createJimuUiStubs()
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
jest.mock('../../src/setting/components/CollapsibleHeader', () => {
  const { passthroughChildren } = require('../helpers/stubComponents')
  return { __esModule: true, default: passthroughChildren }
})
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

const readBundledMapViewpoint = jest.fn(() => Promise.resolve(null))

jest.mock('../../src/setting/bundledMapViewpoint', () => ({
  __esModule: true,
  canvasMapViewpoint: () => null,
  portalUrlForItem: () => 'https://data.example.com',
  portalUrlForSource: () => 'https://data.example.com',
  readBundledMapViewpoint: (...args: unknown[]) => readBundledMapViewpoint(...args as [])
}))

import { widgetSettingRender, wrapWidgetSetting } from 'jimu-for-test'
import _Setting from '../../src/setting/setting'
import { makeImmutableConfig } from '../helpers/configFactories'
import { RuntimeLocation } from '../../src/setting/runtimeLocation'

const render = widgetSettingRender()

describe('Audiom setting panel', () => {
  beforeEach(() => {
    readBundledMapViewpoint.mockReset()
    readBundledMapViewpoint.mockResolvedValue(null)
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

  it('hides Map widget controls and shows the web map source in bundled mode', () => {
    const Setting = wrapWidgetSetting(_Setting, {
      config: makeImmutableConfig({ runtimeLocation: RuntimeLocation.Bundled }) as any,
      onSettingChange: jest.fn(),
      useMapWidgetIds: ['external-map']
    } as any)
    const { queryByText, getByText } = render(<Setting widgetId="audiom-set-bundled" />)
    expect(queryByText('Use Existing Map Widget')).toBeNull()
    expect(queryByText('Select Map Widget')).toBeNull()
    expect(getByText('A web map or web scene.')).not.toBeNull()
  })

  it('keeps the bundled map selector visible without a Connect to data toggle', () => {
    const onSettingChange = jest.fn()
    const Setting = wrapWidgetSetting(_Setting, {
      config: makeImmutableConfig({ runtimeLocation: RuntimeLocation.Bundled }) as any,
      onSettingChange,
      useDataSourcesEnabled: false
    } as any)
    const { getByTestId } = render(<Setting widgetId="audiom-set-bundled-source" />)
    const selector = getByTestId('map-source-selector')
    expect(selector.getAttribute('data-must-use')).toBe('true')
    expect(selector.getAttribute('data-enabled')).toBe('true')
    expect(onSettingChange).toHaveBeenCalledWith(expect.objectContaining({
      useDataSourcesEnabled: true
    }))
  })

  it('saves the selected web map item id so the canvas can leave the empty state', () => {
    const store = getAppStore() as unknown as { getState: () => unknown }
    const state = store.getState() as {
      appConfig?: { dataSources?: Record<string, unknown> }
      appStateInBuilder?: { appConfig?: { dataSources?: Record<string, unknown> } }
    }
    const previous = state.appStateInBuilder
    state.appStateInBuilder = {
      appConfig: {
        dataSources: {
          dataSource_2: { itemId: 'item-99', portalUrl: 'https://data.example.com' }
        }
      }
    }
    const onSettingChange = jest.fn()
    const Setting = wrapWidgetSetting(_Setting, {
      config: makeImmutableConfig({
        runtimeLocation: RuntimeLocation.Bundled,
        mapItemId: ''
      }) as any,
      onSettingChange,
      useDataSources: [{ dataSourceId: 'dataSource_2', mainDataSourceId: 'dataSource_2' }]
    } as any)
    const { getByTestId, unmount } = render(<Setting widgetId="audiom-set-bundled-item" />)
    getByTestId('map-source-selector').click()
    const saved = onSettingChange.mock.calls.find(
      ([arg]) => (arg.config as { mapItemId?: string })?.mapItemId === 'item-99'
    )
    expect(saved).toBeDefined()
    unmount()
    state.appStateInBuilder = previous
  })

  it('writes center, zoom, and sources from the selected item, not a canvas event', async () => {
    readBundledMapViewpoint.mockResolvedValue({
      title: 'Counties',
      centerLongitude: -98.5,
      centerLatitude: 39.8,
      zoom: 5,
      sourceConfigs: [{
        name: 'Counties',
        source: 'https://services.example.com/counties',
        sourceUrl: 'https://services.example.com/counties',
        enabled: true,
        locked: true
      }]
    } as any)
    const onSettingChange = jest.fn()
    const Setting = wrapWidgetSetting(_Setting, {
      config: makeImmutableConfig({
        runtimeLocation: RuntimeLocation.Bundled,
        mapItemId: 'item-99',
        centerLongitude: 0,
        centerLatitude: 0,
        zoom: 2,
        sourceConfigs: []
      }) as any,
      onSettingChange,
      useDataSources: [{ dataSourceId: 'dataSource_2', mainDataSourceId: 'dataSource_2' }]
    } as any)
    const store = getAppStore() as unknown as { getState: () => unknown }
    const state = store.getState() as {
      appStateInBuilder?: { appConfig?: { dataSources?: Record<string, unknown> } }
    }
    const previous = state.appStateInBuilder
    state.appStateInBuilder = {
      appConfig: {
        dataSources: {
          dataSource_2: { itemId: 'item-99', portalUrl: 'https://data.example.com' }
        }
      }
    }
    const { unmount } = render(<Setting widgetId="audiom-set-bundled-sync" />)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(readBundledMapViewpoint).toHaveBeenCalledWith('item-99', 'https://data.example.com')
    const saved = onSettingChange.mock.calls.map(([arg]) => arg.config).find(
      (config) => config?.centerLongitude === -98.5
    )
    expect(saved?.centerLatitude).toBe(39.8)
    expect(saved?.zoom).toBe(5)
    expect(saved?.sourceConfigs?.[0]?.name).toBe('Counties')
    unmount()
    state.appStateInBuilder = previous
  })

  it('writes latitude, longitude, and zoom when a bundled map source is set', async () => {
    readBundledMapViewpoint.mockResolvedValue({
      centerLongitude: -98.5,
      centerLatitude: 39.8,
      zoom: 5
    } as any)
    const onSettingChange = jest.fn()
    const Setting = wrapWidgetSetting(_Setting, {
      config: makeImmutableConfig({
        runtimeLocation: RuntimeLocation.Bundled,
        mapItemId: 'item-99',
        centerLongitude: 0,
        centerLatitude: 0,
        zoom: 10
      }) as any,
      onSettingChange
    } as any)
    const { unmount } = render(<Setting widgetId="audiom-set-bundled-viewpoint" />)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const saved = onSettingChange.mock.calls.map(([arg]) => arg.config).find(
      (config) => config?.centerLongitude === -98.5
    )
    expect(saved?.centerLatitude).toBe(39.8)
    expect(saved?.zoom).toBe(5)
    unmount()
  })
})
