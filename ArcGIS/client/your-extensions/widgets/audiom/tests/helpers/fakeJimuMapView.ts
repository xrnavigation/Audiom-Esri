/**
 * Lightweight fakes for JimuMapView, MapViewManager, and the Esri map/layer
 * objects that the audiom widget reaches into. These exist because:
 *
 * - The real `jimu-arcgis` module pulls in the entire ArcGIS JSAPI which is
 *   too heavy / non-deterministic to load in jsdom.
 * - jest.config.js already maps `@arcgis/*-components-react` to a stub, but
 *   the JimuMapView surface is large and not stubbed by default. Tests that
 *   need it should `jest.mock('jimu-arcgis')` and use these fakes.
 */
import type { JimuMapView, JimuLayerView } from 'jimu-arcgis'

export interface FakeLayerOptions {
  type?: string
  title?: string
  url?: string
  visible?: boolean
  /** For map-image style layers */
  sublayers?: Array<{ id: number, title?: string, visible?: boolean }>
  /** For group layers */
  layers?: FakeLayer[]
}

export interface FakeLayer {
  type: string
  title: string
  url?: string
  visible: boolean
  sublayers?: any
  layers?: any
  watch: (property: string, callback: (newValue: unknown, oldValue: unknown) => void) => { remove: () => void }
  _fireVisibleChange: (visible: boolean) => void
  _watchCounts: () => number
}

export function makeFakeLayer(opts: FakeLayerOptions = {}): FakeLayer {
  const watchers: Array<(newValue: unknown, oldValue: unknown) => void> = []
  const layer: FakeLayer = {
    type: opts.type ?? 'feature',
    title: opts.title ?? 'Fake Layer',
    url: opts.url,
    visible: opts.visible ?? true,
    sublayers: opts.sublayers,
    layers: opts.layers,
    watch: (property: string, callback: (newValue: unknown, oldValue: unknown) => void) => {
      if (property !== 'visible') {
        return { remove: () => undefined }
      }
      watchers.push(callback)
      return {
        remove: () => {
          const i = watchers.indexOf(callback)
          if (i >= 0) watchers.splice(i, 1)
        }
      }
    },
    _fireVisibleChange: (visible: boolean) => {
      const previous = layer.visible
      layer.visible = visible
      watchers.forEach(fn => fn(visible, previous))
    },
    _watchCounts: () => watchers.length
  }
  return layer
}

interface CollectionHandle {
  remove: () => void
}

interface FakeCollection<T> {
  length: number
  toArray: () => T[]
  forEach: (fn: (item: T, idx: number) => void) => void
  filter: (fn: (item: T) => boolean) => FakeCollection<T>
  includes: (item: T) => boolean
  on: (eventName: string, callback: (event: { item?: T }) => void) => CollectionHandle
  _fire: (eventName: string, item: T) => void
  _listenerCounts: () => { afterAdd: number, afterRemove: number }
  [Symbol.iterator]: () => Iterator<T>
}

/** Build an Esri-collection-like wrapper around an array. */
function makeCollection<T>(items: T[]): FakeCollection<T> {
  const afterAdd: Array<(event: { item?: T }) => void> = []
  const afterRemove: Array<(event: { item?: T }) => void> = []
  const collection: FakeCollection<T> = {
    length: items.length,
    toArray: () => items.slice(),
    forEach: (fn: (item: T, idx: number) => void) => items.forEach(fn),
    filter: (fn: (item: T) => boolean) => makeCollection(items.filter(fn)),
    includes: (item: T) => items.includes(item),
    on: (eventName: string, callback: (event: { item?: T }) => void) => {
      const list = eventName === 'after-add' ? afterAdd : eventName === 'after-remove' ? afterRemove : null
      if (!list) {
        return { remove: () => undefined }
      }
      list.push(callback)
      return {
        remove: () => {
          const i = list.indexOf(callback)
          if (i >= 0) list.splice(i, 1)
        }
      }
    },
    _fire: (eventName: string, item: T) => {
      const list = eventName === 'after-add' ? afterAdd : eventName === 'after-remove' ? afterRemove : []
      list.forEach(fn => fn({ item }))
    },
    _listenerCounts: () => ({ afterAdd: afterAdd.length, afterRemove: afterRemove.length }),
    [Symbol.iterator]: items[Symbol.iterator].bind(items)
  }
  return collection
}

export interface FakeJimuMapViewOptions {
  mapId?: string
  centerLatitude?: number
  centerLongitude?: number
  zoom?: number
  title?: string
  layers?: FakeLayer[]
  baseLayers?: FakeLayer[]
  /**
   * When false, omit Jimu 1.18+ remove/visibility listener APIs so tests
   * exercise the ExB 1.13 JS API fallback path. Defaults to true.
   */
  includeModernLayerListeners?: boolean
}

/**
 * Test-only extension of JimuMapView that exposes helpers for firing the
 * layer/visibility events the production code subscribes to and for
 * inspecting the current listener counts.
 */
export interface FakeJimuMapView extends JimuMapView {
  _fireLayerCreated: (layer: FakeLayer) => void
  _fireLayerRemoved: (layer: FakeLayer) => void
  _fireVisibilityChanged: (layers: FakeLayer[]) => void
  _fireJsApiLayerAdded: (layer: FakeLayer) => void
  _fireJsApiLayerRemoved: (layer: FakeLayer) => void
  _listenerCounts: () => { created: number, removed: number, visibility: number }
  _jsApiListenerCounts: () => { afterAdd: number, afterRemove: number }
}

export function makeFakeJimuMapView(opts: FakeJimuMapViewOptions = {}): FakeJimuMapView {
  const layers = opts.layers ?? []
  const baseLayers = opts.baseLayers ?? []
  const allLayers = [...baseLayers, ...layers]
  const layersCol = makeCollection(layers)
  const allLayersCol = makeCollection(allLayers)
  const baseLayersCol = makeCollection(baseLayers)
  const includeModernLayerListeners = opts.includeModernLayerListeners !== false

  const created: Array<(jlv: JimuLayerView) => void> = []
  const removed: Array<(jlv: JimuLayerView) => void> = []
  const visibility: Array<(jlvs: JimuLayerView[]) => void> = []

  const view = {
    map: {
      allLayers: allLayersCol,
      layers: layersCol,
      basemap: { baseLayers: baseLayersCol },
      portalItem: opts.title ? { title: opts.title } : undefined
    },
    center: opts.centerLongitude !== undefined || opts.centerLatitude !== undefined
      ? {
        latitude: opts.centerLatitude ?? 0,
        longitude: opts.centerLongitude ?? 0
      }
      : undefined,
    zoom: opts.zoom ?? 1
  }

  const jmv: any = {
    id: opts.mapId ?? 'map-widget-1',
    mapWidgetId: opts.mapId ?? 'map-widget-1',
    view,
    addJimuLayerViewCreatedListener: (fn: any) => { created.push(fn) },
    removeJimuLayerViewCreatedListener: (fn: any) => {
      const i = created.indexOf(fn); if (i >= 0) created.splice(i, 1)
    },
    /** Test helpers — fire events to drive MapSyncManager listeners */
    _fireLayerCreated: (layer: FakeLayer) => created.forEach(fn => fn({ layer } as any)),
    _fireLayerRemoved: (layer: FakeLayer) => removed.forEach(fn => fn({ layer } as any)),
    _fireVisibilityChanged: (layers: FakeLayer[]) =>
      visibility.forEach(fn => fn(layers.map(l => ({ layer: l })) as any)),
    _fireJsApiLayerAdded: (layer: FakeLayer) => layersCol._fire('after-add', layer),
    _fireJsApiLayerRemoved: (layer: FakeLayer) => layersCol._fire('after-remove', layer),
    _listenerCounts: () => ({
      created: created.length,
      removed: removed.length,
      visibility: visibility.length
    }),
    _jsApiListenerCounts: () => layersCol._listenerCounts()
  }

  if (includeModernLayerListeners) {
    jmv.addJimuLayerViewRemovedListener = (fn: any) => { removed.push(fn) }
    jmv.removeJimuLayerViewRemovedListener = (fn: any) => {
      const i = removed.indexOf(fn); if (i >= 0) removed.splice(i, 1)
    }
    jmv.addJimuLayerViewsVisibleChangeListener = (fn: any) => { visibility.push(fn) }
    jmv.removeJimuLayerViewsVisibleChangeListener = (fn: any) => {
      const i = visibility.indexOf(fn); if (i >= 0) visibility.splice(i, 1)
    }
  }

  return jmv as FakeJimuMapView
}

/** Build a minimal MapViewManager that returns the supplied JimuMapView for `mapId`. */
export function makeFakeMapViewManager(
  mapId: string,
  jimuMapView: JimuMapView | undefined
) {
  return {
    getJimuMapViewGroup: (id: string) => {
      if (id !== mapId || !jimuMapView) return undefined
      return { jimuMapViews: { [(jimuMapView as any).id]: jimuMapView } }
    },
    getInstance: () => undefined as any
  }
}
