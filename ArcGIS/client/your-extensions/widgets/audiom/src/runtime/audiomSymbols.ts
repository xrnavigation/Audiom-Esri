/**
 * Paint Audiom's rule outputs onto the Esri layers that are already on the map.
 * Colors, widths, opacity, dashes, and patterns come from feature attributes.
 * This file does not evaluate rules and does not draw a second map.
 *
 * Pattern bitmaps are the canonical tiles in patternTiles.ts, kept in step
 * with Audiom-Front-End/src/runtime/patternTiles.ts.
 */
import {
  patternTileUrl as canonicalPatternTileUrl,
  patternToken as canonicalPatternToken
} from './patternTiles'

export interface SymbolFeature {
  attributes?: Record<string, unknown>
  symbol?: unknown
}

export interface SymbolLayer {
  id?: string
  title?: string
  type?: string
  renderer?: unknown
  /** Host renderer captured the first time Audiom paints this layer. */
  __audiomOriginalRenderer?: unknown
}

export interface SymbolModules {
  SimpleFillSymbol: new (properties: unknown) => unknown
  SimpleLineSymbol: new (properties: unknown) => unknown
  SimpleMarkerSymbol: new (properties: unknown) => unknown
  UniqueValueRenderer: new (properties: unknown) => unknown
  PictureFillSymbol?: new (properties: unknown) => unknown
}

export type VectorStyleMode = 'colors' | 'patterns' | 'both' | 'none' | 'hidden'

const NAVY = '#04203e'
const DEFAULT_FILL = '#7bbf75'
const STYLE_FIELD = 'audiomStyle'

function colorOf (value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function numberOf (value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

/** Esri color with alpha. fill-opacity is 0-1; missing means opaque. */
export function colorWithOpacity (hex: string, opacity: unknown): string | number[] {
  const alpha = numberOf(opacity, 1)
  if (alpha >= 1) return hex
  const clamped = Math.max(0, Math.min(1, alpha))
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return hex
  const value = Number.parseInt(match[1], 16)
  return [
    (value >> 16) & 255,
    (value >> 8) & 255,
    value & 255,
    Math.round(clamped * 255)
  ]
}

function dashStyle (value: unknown): 'solid' | 'dash' | 'dot' | 'dash-dot' {
  if (value == null || value === '' || value === 'none') return 'solid'
  const text = Array.isArray(value) ? value.join(',') : String(value)
  if (!text || text === '0' || text === 'none') return 'solid'
  const first = Number(text.split(/[,\s]+/)[0])
  if (Number.isFinite(first) && first > 0 && first < 1) return 'dot'
  if (/dot/i.test(text)) return 'dot'
  return 'dash'
}

function hasPattern (attributes: Record<string, unknown> | undefined): boolean {
  return attributes?.['fill-pattern'] != null && attributes['fill-pattern'] !== ''
}

export function styleKey (attributes: Record<string, unknown> | undefined): string {
  const fill = colorOf(attributes?.fill, '')
  const stroke = colorOf(attributes?.stroke, '')
  const width = numberOf(attributes?.['stroke-width'], 0)
  const opacity = numberOf(attributes?.['fill-opacity'], 1)
  const dash = attributes?.['stroke-dasharray'] == null ? '' : String(attributes['stroke-dasharray'])
  const pattern = hasPattern(attributes) ? canonicalPatternToken(attributes?.['fill-pattern']) : ''
  return `${fill}|${stroke}|${width}|${opacity}|${dash}|${pattern}`
}

function outlineFor (
  modules: SymbolModules,
  attributes: Record<string, unknown> | undefined,
  widthFallback: number
): unknown {
  return new modules.SimpleLineSymbol({
    color: colorOf(attributes?.stroke, NAVY),
    width: numberOf(attributes?.['stroke-width'], widthFallback),
    style: dashStyle(attributes?.['stroke-dasharray'])
  })
}

/**
 * One Esri symbol for one Audiom style bag.
 * vectorStyleMode mirrors the Front-End: patterns suppress fill color when a
 * pattern is present; none/hidden leave the feature unstyled.
 */
export function symbolFor (
  modules: SymbolModules,
  geometryType: string | undefined,
  attributes: Record<string, unknown> | undefined,
  mode: VectorStyleMode = 'both'
): unknown | null {
  if (mode === 'none' || mode === 'hidden') return null
  const showColor = mode === 'colors' || mode === 'both'
  const showPattern = mode === 'patterns' || mode === 'both'
  const fill = colorOf(attributes?.fill, DEFAULT_FILL)
  const patterned = showPattern && hasPattern(attributes)
  const outline = outlineFor(modules, attributes, geometryType === 'polyline' ? 2 : 1.5)

  if (geometryType === 'polyline') {
    return new modules.SimpleLineSymbol({
      color: colorOf(attributes?.stroke, showColor ? colorOf(attributes?.fill, NAVY) : NAVY),
      width: numberOf(attributes?.['stroke-width'], 2),
      style: dashStyle(attributes?.['stroke-dasharray'])
    })
  }
  if (geometryType === 'point' || geometryType === 'multipoint') {
    return new modules.SimpleMarkerSymbol({
      color: showColor ? colorWithOpacity(fill, attributes?.['fill-opacity']) : NAVY,
      size: 10,
      outline
    })
  }
  if (patterned && modules.PictureFillSymbol) {
    return new modules.PictureFillSymbol({
      url: canonicalPatternTileUrl(attributes?.['fill-pattern']),
      width: 16,
      height: 16,
      outline
    })
  }
  return new modules.SimpleFillSymbol({
    color: showColor ? colorWithOpacity(fill, attributes?.['fill-opacity']) : [0, 0, 0, 0],
    outline,
    style: 'solid'
  })
}

function featureIsStyled (attributes: Record<string, unknown>): boolean {
  return attributes.fill != null ||
    attributes.stroke != null ||
    attributes['fill-pattern'] != null ||
    attributes['stroke-width'] != null ||
    attributes['fill-opacity'] != null ||
    attributes['stroke-dasharray'] != null
}

/**
 * Apply one renderer per distinct Audiom style already on the layer.
 * Layers with no Audiom style keys are left alone.
 * The host renderer is saved on first paint and restored by restoreAudiomSymbols.
 */
export function applyAudiomSymbols (
  layer: SymbolLayer & { geometryType?: string, features?: SymbolFeature[] },
  modules: SymbolModules,
  features: SymbolFeature[] = layer.features || [],
  mode: VectorStyleMode = 'both'
): boolean {
  if (!layer || mode === 'none' || mode === 'hidden') return false
  const styled = features.filter((feature) => featureIsStyled(feature.attributes || {}))
  if (!styled.length) return false
  if (layer.__audiomOriginalRenderer === undefined) {
    layer.__audiomOriginalRenderer = layer.renderer
  }
  const groups = new Map<string, Record<string, unknown>>()
  for (const feature of styled) {
    const attributes = feature.attributes || {}
    const key = styleKey(attributes)
    if (!groups.has(key)) groups.set(key, attributes)
    feature.attributes = { ...attributes, [STYLE_FIELD]: key }
  }
  const infos = [...groups.entries()].map(([value, attributes]) => ({
    value,
    symbol: symbolFor(modules, layer.geometryType, attributes, mode)
  })).filter((info) => info.symbol != null)
  if (!infos.length) return false
  layer.renderer = new modules.UniqueValueRenderer({
    field: STYLE_FIELD,
    uniqueValueInfos: infos
  })
  return true
}

/** Put the host renderer back. No-op when Audiom never painted the layer. */
export function restoreAudiomSymbols (layer: SymbolLayer | null | undefined): boolean {
  if (!layer || layer.__audiomOriginalRenderer === undefined) return false
  layer.renderer = layer.__audiomOriginalRenderer
  delete layer.__audiomOriginalRenderer
  return true
}

export function patternTileUrl (token: unknown): string {
  return canonicalPatternTileUrl(token)
}

export function patternToken (value: unknown): string {
  return canonicalPatternToken(value)
}

export const patternLegend = [
  { token: 'dot-pattern', label: 'Dots' },
  { token: 'empty-square-pattern', label: 'Squares' },
  { token: 'grid-pattern', label: 'Grid' },
  { token: 'diagonal-line-pattern', label: 'Diagonal' },
  { token: 'caret-pattern', label: 'Caret' }
] as const
