/**
 * Paint Audiom's rule outputs onto the Esri layers that are already on the map.
 * Colors and patterns come from feature attributes (`fill`, `stroke`,
 * `fill-pattern`). This file does not evaluate rules and does not draw a second map.
 */
import { patternToken } from './mapSnapshot'

export interface SymbolFeature {
  attributes?: Record<string, unknown>
  symbol?: unknown
}

export interface SymbolLayer {
  id?: string
  title?: string
  type?: string
  renderer?: unknown
}

export interface SymbolModules {
  SimpleFillSymbol: new (properties: unknown) => unknown
  SimpleLineSymbol: new (properties: unknown) => unknown
  SimpleMarkerSymbol: new (properties: unknown) => unknown
  UniqueValueRenderer: new (properties: unknown) => unknown
}

const NAVY = '#04203e'

/** 16px pattern tiles. Same tokens Audiom's legend maps to dots, squares, grid, diagonal, caret. */
const PATTERN_TILES: Record<string, string> = {
  'dot-pattern': tile('<circle cx="4" cy="4" r="1.4" fill="#04203e"/><circle cx="12" cy="12" r="1.4" fill="#04203e"/>'),
  'empty-square-pattern': tile('<rect x="2" y="2" width="5" height="5" fill="none" stroke="#04203e" stroke-width="1.2"/><rect x="9" y="9" width="5" height="5" fill="none" stroke="#04203e" stroke-width="1.2"/>'),
  'grid-pattern': tile('<path d="M0 8H16M8 0V16" stroke="#04203e" stroke-width="1"/>'),
  'diagonal-line-pattern': tile('<path d="M0 16L16 0M-4 4L4 -4M12 20L20 12" stroke="#04203e" stroke-width="1.4"/>'),
  'caret-pattern': tile('<path d="M2 6L8 2L14 6" fill="none" stroke="#04203e" stroke-width="1.3"/>')
}

function tile (body: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">${body}</svg>`
  )}`
}

function colorOf (value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function styleKey (attributes: Record<string, unknown> | undefined): string {
  const fill = colorOf(attributes?.fill, '')
  const stroke = colorOf(attributes?.stroke, '')
  const pattern = patternToken(attributes?.['fill-pattern'])
  return `${fill}|${stroke}|${pattern}`
}

function symbolFor (
  modules: SymbolModules,
  geometryType: string | undefined,
  attributes: Record<string, unknown> | undefined
): unknown {
  const fill = colorOf(attributes?.fill, '#7bbf75')
  const stroke = colorOf(attributes?.stroke, NAVY)
  const pattern = patternToken(attributes?.['fill-pattern'])
  const outline = new modules.SimpleLineSymbol({ color: stroke, width: 1.5, style: 'solid' })
  if (geometryType === 'polyline') {
    return new modules.SimpleLineSymbol({ color: stroke, width: 2, style: 'solid' })
  }
  if (geometryType === 'point' || geometryType === 'multipoint') {
    return new modules.SimpleMarkerSymbol({ color: fill, size: 10, outline })
  }
  const PictureFillSymbol = (modules as SymbolModules & {
    PictureFillSymbol?: new (properties: unknown) => unknown
  }).PictureFillSymbol
  if (PictureFillSymbol && attributes?.['fill-pattern'] != null) {
    return new PictureFillSymbol({
      url: patternTileUrl(pattern),
      width: 16,
      height: 16,
      outline
    })
  }
  return new modules.SimpleFillSymbol({ color: fill, outline, style: 'solid' })
}

/**
 * Apply one renderer per distinct Audiom style already on the layer.
 * Layers with no fill, stroke, or pattern are left alone.
 */
export function applyAudiomSymbols (
  layer: SymbolLayer & { geometryType?: string, features?: SymbolFeature[] },
  modules: SymbolModules,
  features: SymbolFeature[] = layer.features || []
): boolean {
  const styled = features.filter((feature) => {
    const attributes = feature.attributes || {}
    return attributes.fill != null || attributes.stroke != null || attributes['fill-pattern'] != null
  })
  if (!styled.length || !layer) return false
  const groups = new Map<string, Record<string, unknown>>()
  for (const feature of styled) {
    const attributes = feature.attributes || {}
    const key = styleKey(attributes)
    if (!groups.has(key)) groups.set(key, attributes)
    feature.attributes = { ...attributes, audiomStyle: key }
  }
  const infos = [...groups.entries()].map(([value, attributes]) => ({
    value,
    symbol: symbolFor(modules, layer.geometryType, attributes)
  }))
  layer.renderer = new modules.UniqueValueRenderer({
    field: 'audiomStyle',
    uniqueValueInfos: infos
  })
  return true
}

export function patternTileUrl (token: unknown): string {
  return PATTERN_TILES[patternToken(token)]
}

export const patternLegend = [
  { token: 'dot-pattern', label: 'Dots' },
  { token: 'empty-square-pattern', label: 'Squares' },
  { token: 'grid-pattern', label: 'Grid' },
  { token: 'diagonal-line-pattern', label: 'Diagonal' },
  { token: 'caret-pattern', label: 'Caret' }
] as const
