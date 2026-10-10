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
  geometryType?: string
  objectIdField?: string
  renderer?: { type?: string }
  /** Host renderer captured the first time Audiom paints this layer. */
  __audiomOriginalRenderer?: unknown
}

export interface SymbolModules {
  SimpleFillSymbol: new (properties: unknown) => unknown
  SimpleLineSymbol: new (properties: unknown) => unknown
  SimpleMarkerSymbol: new (properties: unknown) => unknown
  UniqueValueRenderer: new (properties: unknown) => unknown
  ClassBreaksRenderer?: new (properties: unknown) => unknown
  PictureFillSymbol?: new (properties: unknown) => unknown
}

export type VectorStyleMode = 'colors' | 'patterns' | 'both' | 'none' | 'hidden'

const NAVY = '#04203e'
const DEFAULT_FILL = '#7bbf75'
const STYLE_FIELD = 'audiomStyle'

/**
 * Five-stop LCH samples of heatmap-utils gradientStartEnd. One ramp per
 * statistic, in the same order the website scaleOrdinal uses.
 */
const HEATMAP_RAMPS = [
  ['#edf8fb', '#a4cde8', '#779bd7', '#7563b7', '#810f7c'],
  ['#fafa6e', '#86d780', '#23aa8f', '#007882', '#2a4858'],
  ['#fef0d9', '#eab89b', '#d77c77', '#b53e6f', '#7a0177'],
  ['#ffffcc', '#f6be8e', '#e17a7c', '#aa4488', '#253494'],
  ['#ecfed7', '#d1c290', '#b9845d', '#994644', '#6a013b']
]
const HEATMAP_PATTERNS = [
  'dot-pattern',
  'empty-square-pattern',
  'grid-pattern',
  'diagonal-line-pattern',
  'caret-pattern'
]

export interface HeatmapPaint {
  field: string
  breaks: number[]
  /** Full-layer min and max. Class breaks must cover these, not the page. */
  min: number
  max: number
  paletteIndex: number
}

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
    // PictureFillSymbol paints the bitmap instead of the fill. Bake the band
    // color into the tile so both mode shows the color and the pattern.
    return new modules.PictureFillSymbol({
      url: canonicalPatternTileUrl(attributes?.['fill-pattern'], 16, showColor ? fill : undefined),
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

function arcadeLiteral (value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/**
 * Match features by object id. Writing audiomStyle onto the queried copies
 * does not add that field to the service, so a field renderer paints nothing.
 */
function styleExpression (
  field: string,
  pairs: Array<{ id: string, key: string }>
): string {
  const lines = pairs.map((pair) =>
    `if (${field} == ${arcadeLiteral(pair.id)}) { return ${arcadeLiteral(pair.key)}; }`
  )
  return `${lines.join('\n')}\nreturn null;`
}

function objectIdOf (feature: SymbolFeature, field: string): string | null {
  const attributes = feature.attributes || {}
  const value = attributes[field] ?? attributes.OBJECTID ?? attributes.objectid
  return value == null ? null : String(value)
}

function finiteNumber (value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const BANDS = HEATMAP_RAMPS[0].length

/** Equal-width thresholds between a known min and max. Same edges as the legend. */
export function equalIntervalBreaks (values: number[]): number[] {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length < 2) return []
  return breaksBetween(Math.min(...finite), Math.max(...finite))
}

function breaksBetween (low: number, high: number): number[] {
  if (!Number.isFinite(low) || !Number.isFinite(high) || low === high) return []
  const step = (high - low) / BANDS
  return Array.from({ length: BANDS - 1 }, (_, index) => low + step * (index + 1))
}

function paletteIndexFor (
  features: SymbolFeature[],
  field: string,
  requested?: number,
  propertyOrder?: string[]
): number {
  if (requested != null && Number.isFinite(requested)) {
    return ((requested % HEATMAP_RAMPS.length) + HEATMAP_RAMPS.length) % HEATMAP_RAMPS.length
  }
  // Raw attribute order is not the legend's order. Use the shared list.
  const names = propertyOrder?.length ? propertyOrder : Object.keys(features[0]?.attributes || {})
  const index = names.indexOf(field)
  return index < 0 ? 0 : index % HEATMAP_RAMPS.length
}

/**
 * A varying numeric column. When field is set, only that column is used.
 * Extent is the service min/max when the snapshot has it, else the page.
 */
export function heatmapField (
  features: SymbolFeature[],
  field?: string,
  extents?: Record<string, { min: number, max: number }>,
  paletteIndex?: number,
  propertyOrder?: string[]
): HeatmapPaint | null {
  const columns = new Map<string, number[]>()
  for (const feature of features) {
    const attributes = feature.attributes || {}
    for (const [key, value] of Object.entries(attributes)) {
      if (field && key !== field) continue
      if (key === 'OBJECTID' || key === 'objectid' || key === STYLE_FIELD) continue
      const parsed = finiteNumber(value)
      if (parsed == null) continue
      const column = columns.get(key) || []
      column.push(parsed)
      columns.set(key, column)
    }
  }
  let best: HeatmapPaint | null = null
  columns.forEach((values, name) => {
    if (best) return
    const extent = extents?.[name]
    const min = extent && Number.isFinite(extent.min) ? extent.min : Math.min(...values)
    const max = extent && Number.isFinite(extent.max) ? extent.max : Math.max(...values)
    const breaks = breaksBetween(min, max)
    if (!breaks.length) return
    best = {
      field: name,
      breaks,
      min,
      max,
      paletteIndex: paletteIndexFor(features, name, paletteIndex, propertyOrder)
    }
  })
  return best
}

function heatmapAttributes (paint: HeatmapPaint, value: number, mode: VectorStyleMode): Record<string, unknown> {
  let band = 0
  while (band < paint.breaks.length && value >= paint.breaks[band]) band += 1
  const colors = HEATMAP_RAMPS[paint.paletteIndex] || HEATMAP_RAMPS[0]
  const showColor = mode === 'colors' || mode === 'both'
  const showPattern = mode === 'patterns' || mode === 'both'
  const attributes: Record<string, unknown> = {
    fill: showColor ? colors[Math.min(band, colors.length - 1)] : '#ffffff',
    stroke: NAVY,
    'stroke-width': 1
  }
  if (showPattern) attributes['fill-pattern'] = HEATMAP_PATTERNS[Math.min(band, HEATMAP_PATTERNS.length - 1)]
  return attributes
}

/**
 * Color the service field directly. Esri reads the field on each feature, so
 * this does not depend on object ids from a query copy.
 */
function classBreaksFor (
  modules: SymbolModules,
  geometryType: string | undefined,
  paint: HeatmapPaint,
  mode: VectorStyleMode
): unknown | null {
  if (!modules.ClassBreaksRenderer) return null
  const colors = HEATMAP_RAMPS[paint.paletteIndex] || HEATMAP_RAMPS[0]
  const classBreakInfos = colors.map((_, band) => {
    // Open the ends. A closed max equal to the service max drops that value,
    // and a page min above the service min drops every plot below the page.
    const minValue = band === 0 ? Number.NEGATIVE_INFINITY : paint.breaks[band - 1]
    const maxValue = band === colors.length - 1 ? Number.POSITIVE_INFINITY : paint.breaks[band]
    return {
      minValue,
      maxValue,
      symbol: symbolFor(modules, geometryType, heatmapAttributes(paint, band === 0 ? paint.min : minValue, mode), mode)
    }
  }).filter((info) => info.symbol != null)
  if (classBreakInfos.length !== colors.length) return null
  return new modules.ClassBreaksRenderer({
    field: paint.field,
    classBreakInfos
  })
}

/**
 * Paint Audiom style keys when they are already on the features.
 * Otherwise paint a varying numeric field with class breaks on that field.
 * The host renderer is saved and restored by restoreAudiomSymbols.
 */
export function applyAudiomSymbols (
  layer: SymbolLayer & { geometryType?: string, features?: SymbolFeature[] },
  modules: SymbolModules,
  features: SymbolFeature[] = layer.features || [],
  mode: VectorStyleMode = 'both',
  field?: string,
  extents?: Record<string, { min: number, max: number }>,
  paletteIndex?: number,
  propertyOrder?: string[]
): boolean {
  if (!layer || mode === 'none' || mode === 'hidden') return false
  // A host heatmap renderer already draws the surface. Replacing it with
  // polygon fills would erase that draw.
  if (layer.renderer?.type === 'heatmap') return false
  // A previous paint saved the host renderer. Keep that copy. Assigning it
  // back here is the flash of the original Esri colors between paints.
  // Style keys win. Otherwise color a varying numeric field with class
  // breaks. The field is on the service, so Esri can draw it without an
  // object-id expression.
  const styled = features.filter((feature) => featureIsStyled(feature.attributes || {}))
  if (!styled.length) {
    const paint = heatmapField(features, field, extents, paletteIndex, propertyOrder)
    const renderer = paint ? classBreaksFor(modules, layer.geometryType, paint, mode) : null
    if (!renderer) return false
    if (layer.__audiomOriginalRenderer === undefined) {
      layer.__audiomOriginalRenderer = layer.renderer
    }
    layer.renderer = renderer
    return true
  }
  if (layer.__audiomOriginalRenderer === undefined) {
    layer.__audiomOriginalRenderer = layer.renderer
  }
  const idField = layer.objectIdField || 'OBJECTID'
  const groups = new Map<string, Record<string, unknown>>()
  const pairs: Array<{ id: string, key: string }> = []
  for (const feature of features) {
    const id = objectIdOf(feature, idField)
    if (!id) continue
    const attributes = feature.attributes || {}
    if (!featureIsStyled(attributes)) continue
    const key = styleKey(attributes)
    if (!groups.has(key)) groups.set(key, attributes)
    pairs.push({ id, key })
    feature.attributes = { ...feature.attributes, [STYLE_FIELD]: key }
  }
  const infos = [...groups.entries()].map(([value, attributes]) => ({
    value,
    symbol: symbolFor(modules, layer.geometryType, attributes, mode)
  })).filter((info) => info.symbol != null)
  if (!infos.length || !pairs.length) return false
  layer.renderer = new modules.UniqueValueRenderer({
    valueExpression: styleExpression(idField, pairs),
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

export function patternTileUrl (token: unknown, size = 16, fill?: string): string {
  return canonicalPatternTileUrl(token, size, fill)
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
