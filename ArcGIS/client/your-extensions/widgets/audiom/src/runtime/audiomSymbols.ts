/**
 * Paint Audiom's rule outputs onto the Esri layers that are already on the map.
 * Colors, widths, opacity, dashes, and patterns come from feature attributes.
 * Room names are Esri labeling on those same layers, the text the embedded
 * MapLibre map draws with buildLabelLayers. This file does not evaluate rules
 * and does not draw a second map.
 *
 * Pattern bitmaps are the canonical tiles in patternTiles.ts, kept in step
 * with Audiom-Front-End/src/runtime/patternTiles.ts.
 */
import { AUDIOM_NAVY as NAVY } from './chrome'
import {
  PATTERN_TOKENS,
  patternTileUrl as canonicalPatternTileUrl,
  patternToken as canonicalPatternToken
} from './patternTiles'

export { patternLegend } from './patternTiles'

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
  /** Host and Audiom renderers. `kind` is a test double; Esri uses `type`. */
  renderer?: { type?: string, kind?: string, symbol?: unknown }
  /** Host renderer captured the first time Audiom paints this layer. */
  __audiomOriginalRenderer?: unknown
}

/** Esri field list. A Collection has forEach; tests pass an array. */
export type LabelFieldList = ArrayLike<{ name?: string }> & {
  forEach?: (fn: (field: { name?: string }) => void) => void
}

export interface LabelLayer {
  geometryType?: string
  fields?: LabelFieldList
  displayField?: string
  labelingInfo?: unknown
  labelsVisible?: boolean
  /** Floor catalog. The rules file excludes Level, so it must not be labeled. */
  floorCatalog?: boolean
  /** Host labeling captured the first time Audiom touches this layer. */
  __audiomLabelState?: {
    labelingInfo: unknown
    labelsVisible: boolean | undefined
  }
}

export interface SymbolModules {
  SimpleFillSymbol: new (properties: unknown) => unknown
  SimpleLineSymbol: new (properties: unknown) => unknown
  SimpleMarkerSymbol: new (properties: unknown) => unknown
  UniqueValueRenderer: new (properties: unknown) => unknown
  ClassBreaksRenderer?: new (properties: unknown) => unknown
  PictureFillSymbol?: new (properties: unknown) => unknown
  SimpleRenderer?: new (properties: unknown) => unknown
}

/** How the legend asks the map to draw a statistic. Values match the Front-End store. */
export enum VectorStyleMode {
  Colors = 'colors',
  Patterns = 'patterns',
  Both = 'both',
  None = 'none',
  Hidden = 'hidden'
}

const DEFAULT_FILL = '#7bbf75'
const DEFAULT_GREY = '#b0b0b0'
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
  mode: VectorStyleMode = VectorStyleMode.Both
): unknown | null {
  if (mode === VectorStyleMode.None || mode === VectorStyleMode.Hidden) return null
  const showColor = mode === VectorStyleMode.Colors || mode === VectorStyleMode.Both
  const showPattern = mode === VectorStyleMode.Patterns || mode === VectorStyleMode.Both
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

const CATEGORY_FIELDS = [
  'USE_TYPE', 'use_type', 'amenity', 'category', 'class', 'fclass', 'landuse',
  'TYPE', 'type', 'RuleType'
]

const STYLE_OUTPUTS = new Set([
  'fill', 'stroke', 'stroke-width', 'fill-pattern', 'fill-opacity',
  'stroke-opacity', 'stroke-dasharray', 'ruleName', 'ruleNamePlural',
  'ruleType', 'passable', 'width', 'audiomStyle'
])

function isIdentityField (field: string): boolean {
  const key = field.toLowerCase()
  return key === 'objectid' || key === 'fid' || key === 'globalid' ||
    key === 'name' || key === 'title' || key === 'label' || key.endsWith('_id')
}

/**
 * A service field that already explains the rule styles, such as USE_TYPE.
 * Painting that field colors the whole layer, not only the queried page.
 */
function styleCategoryField (features: SymbolFeature[]): string | null {
  const styled = features.filter((feature) => featureIsStyled(feature.attributes || {}))
  if (!styled.length) return null
  const names = new Set<string>()
  for (const feature of styled) {
    for (const key of Object.keys(feature.attributes || {})) names.add(key)
  }
  const ordered = [
    ...CATEGORY_FIELDS.filter((name) => names.has(name)),
    ...[...names].filter((name) => !CATEGORY_FIELDS.includes(name))
  ]
  for (const field of ordered) {
    if (isIdentityField(field) || STYLE_OUTPUTS.has(field)) continue
    const groups = new Map<string, string>()
    let ok = true
    for (const feature of styled) {
      const value = feature.attributes?.[field]
      if (typeof value !== 'string' || !value.trim()) {
        ok = false
        break
      }
      const key = styleKey(feature.attributes)
      const previous = groups.get(value)
      if (previous !== undefined && previous !== key) {
        ok = false
        break
      }
      groups.set(value, key)
    }
    if (!ok || !groups.size) continue
    // A preferred column such as USE_TYPE is the category even when the page
    // happens to hold one feature of each type. Other columns that are unique
    // per feature are names, not styles.
    const preferred = CATEGORY_FIELDS.includes(field)
    if (!preferred && styled.length > 1 && groups.size >= styled.length) continue
    return field
  }
  return null
}

function categoryRenderer (
  modules: SymbolModules,
  geometryType: string | undefined,
  features: SymbolFeature[],
  mode: VectorStyleMode
): unknown | null {
  const field = styleCategoryField(features)
  if (!field) return null
  const groups = new Map<string, Record<string, unknown>>()
  for (const feature of features) {
    const attributes = feature.attributes || {}
    if (!featureIsStyled(attributes)) continue
    const value = attributes[field]
    if (typeof value !== 'string' || !value.trim() || groups.has(value)) continue
    groups.set(value, attributes)
  }
  if (!groups.size) return null
  const uniqueValueInfos = [...groups.entries()].map(([value, attributes]) => ({
    value,
    symbol: symbolFor(modules, geometryType, attributes, mode)
  })).filter((info) => info.symbol != null)
  if (!uniqueValueInfos.length) return null
  const defaultSymbol = symbolFor(modules, geometryType, {
    fill: DEFAULT_GREY,
    stroke: NAVY,
    'stroke-width': 1
  }, mode)
  return new modules.UniqueValueRenderer({
    field,
    uniqueValueInfos,
    ...(defaultSymbol ? { defaultSymbol } : {})
  })
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
  requested?: number
): number {
  // The dropdown index. Missing means the first statistic, which is ramp 0.
  if (requested == null || !Number.isFinite(requested)) return 0
  return ((requested % HEATMAP_RAMPS.length) + HEATMAP_RAMPS.length) % HEATMAP_RAMPS.length
}

/**
 * A varying numeric column. When field is set, only that column is used.
 * Extent is the service min/max when the snapshot has it, else the page.
 */
export function heatmapField (
  features: SymbolFeature[],
  field?: string,
  extents?: Record<string, { min: number, max: number }>,
  paletteIndex?: number
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
    const pageMin = Math.min(...values)
    const pageMax = Math.max(...values)
    const extentMin = extent && Number.isFinite(extent.min) ? extent.min : pageMin
    const extentMax = extent && Number.isFinite(extent.max) ? extent.max : pageMax
    // A service extent that does not vary still leaves the page uncolored.
    // Use the page when that is the range that actually changes.
    const min = extentMin === extentMax && pageMin !== pageMax ? pageMin : extentMin
    const max = extentMin === extentMax && pageMin !== pageMax ? pageMax : extentMax
    const breaks = breaksBetween(min, max)
    if (!breaks.length) return
    best = {
      field: name,
      breaks,
      min,
      max,
      paletteIndex: paletteIndexFor(paletteIndex)
    }
  })
  return best
}

function heatmapAttributes (paint: HeatmapPaint, value: number, mode: VectorStyleMode): Record<string, unknown> {
  let band = 0
  while (band < paint.breaks.length && value >= paint.breaks[band]) band += 1
  const colors = HEATMAP_RAMPS[paint.paletteIndex] || HEATMAP_RAMPS[0]
  const showColor = mode === VectorStyleMode.Colors || mode === VectorStyleMode.Both
  const showPattern = mode === VectorStyleMode.Patterns || mode === VectorStyleMode.Both
  const attributes: Record<string, unknown> = {
    fill: showColor ? colors[Math.min(band, colors.length - 1)] : '#ffffff',
    stroke: NAVY,
    'stroke-width': 1
  }
  if (showPattern) attributes['fill-pattern'] = PATTERN_TOKENS[Math.min(band, PATTERN_TOKENS.length - 1)]
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
 * Travel and indoor have no statistic paint. A flat grey fill is the
 * unmodified map. A rules file is what replaces it. The host renderer is
 * saved once so a later heatmap paint does not capture this grey as the
 * original.
 */
function paintDefaultGrey (
  layer: SymbolLayer & { geometryType?: string },
  modules: SymbolModules
): boolean {
  const symbol = symbolFor(modules, layer.geometryType, {
    fill: DEFAULT_GREY,
    stroke: NAVY,
    'stroke-width': 1
  }, VectorStyleMode.Colors)
  if (!symbol) return false
  if (layer.__audiomOriginalRenderer === undefined) {
    layer.__audiomOriginalRenderer = layer.renderer
  }
  const Renderer = modules.SimpleRenderer
  layer.renderer = Renderer
    ? new Renderer({ symbol })
    : { type: 'simple', symbol }
  return true
}

/**
 * Paint Audiom style keys when they are already on the features.
 * Otherwise paint a varying numeric field with class breaks on that field.
 * Heatmap is that choropleth, not Esri's density renderer: a density
 * renderer draws nothing on polygon land-use and the layer vanishes.
 * Travel and indoor are a flat grey fill. The web map's own renderer is the
 * patterns and colors the user does not want until a rules file paints them.
 * The host renderer is saved so a later heatmap paint does not capture grey.
 * Rule outputs already on the features replace that grey, for every map type.
 */
export function applyAudiomSymbols (
  layer: SymbolLayer & { geometryType?: string, features?: SymbolFeature[] },
  modules: SymbolModules,
  features: SymbolFeature[] = layer.features || [],
  mode: VectorStyleMode = VectorStyleMode.Both,
  field?: string,
  extents?: Record<string, { min: number, max: number }>,
  paletteIndex?: number,
  mapType?: string,
  rulesApplied = false
): boolean {
  if (!layer || mode === VectorStyleMode.None || mode === VectorStyleMode.Hidden) return false
  // Indoor is colors only. The rules file still stamps fill-pattern, and the
  // heatmap legend can ask for patterns, but an indoor floor plan has no use
  // for those tiles.
  const type = mapType === 'standard' ? 'travel' : mapType
  const paintMode = type === 'indoor' ? VectorStyleMode.Colors : mode
  // A host heatmap renderer already draws the surface. Replacing it with
  // polygon fills would erase that draw.
  const current = layer.renderer
  if (current?.type === 'heatmap' && layer.__audiomOriginalRenderer === undefined) return false
  // Style keys win, including indoor and travel. A rules file stamps them
  // before this paint. Grey is only the fallback when nothing was stamped.
  const styled = features.filter((feature) => featureIsStyled(feature.attributes || {}))
  if (styled.length) {
    const categorized = categoryRenderer(modules, layer.geometryType, features, paintMode)
    if (categorized) {
      if (layer.__audiomOriginalRenderer === undefined) {
        layer.__audiomOriginalRenderer = layer.renderer
      }
      layer.renderer = categorized
      return true
    }
  }
  // Heatmap is the only type that paints the statistic. Travel and indoor
  // are a flat grey fill until a rules file paints them. 'standard' is
  // Audiom's travel value. The host renderer stays saved. A rules file that
  // excluded every feature must not cover the map with that grey.
  if (!styled.length && rulesApplied) return false
  if (!styled.length && type && type !== 'heatmap') {
    return paintDefaultGrey(layer, modules)
  }
  if (!styled.length) {
    let paint = heatmapField(features, field, extents, paletteIndex)
    // The requested field can be a placeholder, or a column that does not
    // vary. Either makes this paint return false and leave the host renderer.
    // Fall back to the first varying measure so the first load still draws.
    if (!paint && field) {
      paint = heatmapField(features, undefined, extents, paletteIndex)
    }
    const renderer = paint ? classBreaksFor(modules, layer.geometryType, paint, paintMode) : null
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
    symbol: symbolFor(modules, layer.geometryType, attributes, paintMode)
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
  layer.renderer = layer.__audiomOriginalRenderer as SymbolLayer['renderer']
  delete layer.__audiomOriginalRenderer
  return true
}

/**
 * Web Mercator scale at zoom 9. The embed's default labelMinZoom is 9, so
 * room names stay off a world view and on once the building is in frame.
 */
export const LABEL_MIN_SCALE = 1155581

/**
 * Same coalesce as the embed's detailed label, plus the service spellings
 * rules read (`NAME`) and the use type rules copy into `ruleName`.
 */
const LABEL_FIELDS = [
  'name', 'Name', 'NAME', 'NAME_LONG', 'NAME_SHORT',
  'Label', 'LABEL', 'label',
  'title', 'Title', 'TITLE',
  'ruleName',
  'USE_TYPE', 'use_type',
  'ruleType'
]

function eachLabelField (
  fields: LabelFieldList | undefined,
  visit: (field: { name?: string }) => void
): void {
  if (!fields) return
  if (typeof fields.forEach === 'function') {
    fields.forEach(visit)
    return
  }
  const list = fields as ArrayLike<{ name?: string }>
  for (let index = 0; index < list.length; index += 1) visit(list[index])
}

function fieldNames (fields: LabelFieldList | undefined): Map<string, string> {
  const names = new Map<string, string>()
  eachLabelField(fields, (field) => {
    if (field?.name) names.set(field.name.toLowerCase(), field.name)
  })
  return names
}

/** Schema fields the embed would print, in that preference order. */
export function labelFieldsOf (layer: LabelLayer | null | undefined): string[] {
  const known = fieldNames(layer?.fields)
  const ordered: string[] = []
  const add = (name: string | undefined) => {
    if (!name) return
    const actual = known.get(name.toLowerCase())
    if (!actual || ordered.some((item) => item.toLowerCase() === actual.toLowerCase())) return
    ordered.push(actual)
  }
  for (const field of LABEL_FIELDS) add(field)
  const display = layer?.displayField
  if (display && !/^(objectid|fid|oid|globalid)$/i.test(display)) add(display)
  return ordered
}

function arcadeField (name: string): string {
  return `$feature[${JSON.stringify(name)}]`
}

/**
 * Empty and "unlabeled" draw nothing. A direction arrow is not a caption.
 * A Level use type is the floor catalog the rules file excludes.
 */
export function labelExpression (
  fields: readonly string[],
  extras?: { directionField?: string, levelUseField?: string }
): string {
  const guards: string[] = []
  if (extras?.directionField) {
    guards.push(`if (!IsEmpty(${arcadeField(extras.directionField)})) return "";`)
  }
  if (extras?.levelUseField) {
    guards.push(`if (Lower(clean(${arcadeField(extras.levelUseField)})) == "level") return "";`)
  }
  const reads = fields.map((field) => `clean(${arcadeField(field)})`).join(', ')
  return [
    'function clean(value) {',
    '  if (IsEmpty(value)) return "";',
    '  var text = Trim(Text(value));',
    '  if (text == "" || Lower(text) == "unlabeled") return "";',
    '  return text;',
    '}',
    ...guards,
    `var values = [${reads}];`,
    'for (var i in values) {',
    '  if (values[i] != "") return values[i];',
    '}',
    'return "";'
  ].join('\n')
}

/** Polygon names sit in the room. Points sit on the point. Lines follow the line. */
export function labelPlacement (geometryType: string | undefined): string {
  const key = (geometryType || '').toLowerCase()
  if (key.includes('point')) return 'center-center'
  if (key.includes('line') || key.includes('polyline')) return 'center-along'
  return 'always-horizontal'
}

function audiomLabelClass (
  layer: LabelLayer,
  fields: readonly string[],
  mode: VectorStyleMode
): Record<string, unknown> {
  const known = fieldNames(layer.fields)
  const hidden = mode === VectorStyleMode.None || mode === VectorStyleMode.Hidden
  return {
    labelExpressionInfo: {
      expression: labelExpression(fields, {
        directionField: known.get('directionsymbol'),
        levelUseField: known.get('use_type')
      })
    },
    labelPlacement: labelPlacement(layer.geometryType),
    minScale: LABEL_MIN_SCALE,
    deconflictionStrategy: 'static',
    repeatLabel: false,
    allowOverrun: true,
    symbol: {
      type: 'text',
      color: hidden ? '#ffffff' : '#1f2933',
      haloColor: hidden ? '#000000' : '#ffffff',
      haloSize: hidden ? 2 : 1.5,
      horizontalAlignment: 'center',
      verticalAlignment: 'middle',
      font: { size: 12, family: 'Arial', weight: 'bold' }
    }
  }
}

function rememberLabels (layer: LabelLayer): void {
  if (layer.__audiomLabelState) return
  layer.__audiomLabelState = {
    labelingInfo: layer.labelingInfo,
    labelsVisible: layer.labelsVisible
  }
}

export interface LabelHint {
  /** Stamped on the query copy, not the live Esri layer. */
  floorCatalog?: boolean
  fields?: LabelFieldList
  displayField?: string
}

/**
 * Turn on the text the embed draws over each room. A floor catalog is hidden:
 * its name is "Level 1", and the rules file excludes that polygon. Host
 * labeling is saved so unmount can put the web map back.
 */
export function applyAudiomLabels (
  layer: LabelLayer | null | undefined,
  mode: VectorStyleMode = VectorStyleMode.Colors,
  showLabels = true,
  hint?: LabelHint
): boolean {
  if (!layer) return false
  if (hint?.floorCatalog || layer.floorCatalog || !showLabels) {
    rememberLabels(layer)
    try {
      // Empty the class as well as the flag. A web map site label stays
      // on screen when only labelsVisible is cleared.
      layer.labelingInfo = []
      layer.labelsVisible = false
      return true
    } catch {
      return false
    }
  }
  const fromLayer = labelFieldsOf(layer)
  const described: LabelLayer = fromLayer.length
    ? layer
    : {
        geometryType: layer.geometryType,
        fields: hint?.fields || layer.fields,
        displayField: hint?.displayField || layer.displayField
      }
  const fields = fromLayer.length ? fromLayer : labelFieldsOf(described)
  if (!fields.length) return false
  rememberLabels(layer)
  try {
    layer.labelingInfo = [audiomLabelClass(described, fields, mode)]
    layer.labelsVisible = true
    return true
  } catch {
    return false
  }
}

/** Put the host labeling back. No-op when Audiom never labeled the layer. */
export function restoreAudiomLabels (layer: LabelLayer | null | undefined): boolean {
  const saved = layer?.__audiomLabelState
  if (!layer || !saved) return false
  try {
    layer.labelingInfo = saved.labelingInfo
    layer.labelsVisible = saved.labelsVisible
  } catch {
    return false
  }
  delete layer.__audiomLabelState
  return true
}

export function patternTileUrl (token: unknown, size = 16, fill?: string): string {
  return canonicalPatternTileUrl(token, size, fill)
}

export function patternToken (value: unknown): string {
  return canonicalPatternToken(value)
}
