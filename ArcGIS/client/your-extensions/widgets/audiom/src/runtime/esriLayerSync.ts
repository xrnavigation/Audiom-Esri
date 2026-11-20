/**
 * Keep the Esri map in step with Audiom's legend: the layers the user turned
 * off, and the floor the user picked.
 *
 * The runtime reports both in onStyleChanged (hiddenSources, floor). The Esri
 * map is the host's, so the widget applies them here. Out-of-scale layers are
 * not touched: they stay navigable, matching mapSnapshot.
 *
 * Moved from the Front-End feature/1977-use-map-viewer embed, which drew the
 * legend over this map before the widget used the published runtime.
 */
import { FALLBACK_LAYER_SOURCE_ID } from './mapSnapshot'

export interface EsriLayerLike {
  id?: string
  title?: string
  visible?: boolean
  fields?: Array<{ name?: string, type?: string }>
  definitionExpression?: string | null
  floorInfo?: { field?: string } | null
}

export interface EsriLayerCollection {
  forEach: (fn: (layer: EsriLayerLike) => void) => void
  on?: (event: string, cb: () => void) => { remove?: () => void }
}

export interface EsriLayerMap {
  allLayers?: EsriLayerCollection
  layers?: EsriLayerCollection
}

/** The id mapSnapshot gives a source, so a toggle hits the layer the snapshot named. */
export function esriLayerSourceId (layer: EsriLayerLike): string {
  return layer.id || layer.title || FALLBACK_LAYER_SOURCE_ID
}

export function esriLayersOf (map: EsriLayerMap | null | undefined): EsriLayerLike[] {
  const collection = map?.allLayers ?? map?.layers
  if (!collection) return []
  const layers: EsriLayerLike[] = []
  collection.forEach((layer) => layers.push(layer))
  return layers
}

/**
 * Set `visible` on every Esri layer whose snapshot id is `sourceId`.
 * Returns how many layers changed. A missing layer is a no-op.
 */
export function setEsriLayerVisible (
  map: EsriLayerMap | null | undefined,
  sourceId: string,
  visible: boolean
): number {
  let changed = 0
  for (const layer of esriLayersOf(map)) {
    if (esriLayerSourceId(layer) !== sourceId) continue
    intendedVisible.set(layer, visible)
    watchLayerVisible(layer)
    if (layer.visible === visible) continue
    layer.visible = visible
    changed += 1
  }
  return changed
}

function watchLayerVisible (layer: EsriLayerLike): void {
  const watchable = layer as EsriLayerLike & {
    watch?: (name: string, cb: () => void) => unknown
  }
  if (typeof watchable.watch !== 'function' || watchedVisibility.has(layer)) return
  watchedVisibility.add(layer)
  watchable.watch('visible', () => {
    // A map click must not turn a hidden source back on. The eye stays off.
    const wanted = intendedVisible.get(layer)
    if (wanted === undefined || layer.visible === wanted) return
    layer.visible = wanted
  })
}

function enforceHiddenLayers (view: EsriFloorView | null | undefined): void {
  for (const layer of esriLayersOf(mapOf(view))) {
    const wanted = intendedVisible.get(layer)
    if (wanted === undefined || layer.visible === wanted) continue
    layer.visible = wanted
  }
}

/** A feature layer the floor filter can query and hide. */
export interface EsriFloorLayer extends EsriLayerLike {
  objectIdField?: string
  setDefinitionExpression?: (expression: string | null) => void
  refresh?: () => void
  createQuery?: () => {
    where?: string
    outFields?: string[]
    returnGeometry?: boolean
    num?: number
  }
  queryFeatures?: (query: unknown) => Promise<{
    features?: Array<{ attributes?: Record<string, unknown> }>
  }>
  queryFeatureCount?: (query: unknown) => Promise<number>
}

export interface EsriFloorView {
  map?: EsriLayerMap | null
  whenLayerView?: (layer: EsriLayerLike) => Promise<EsriFloorLayerView | null>
  hitTest?: (event: unknown) => Promise<EsriFloorHit | null | undefined>
  on?: (event: string, cb: () => void) => { remove?: () => void }
}

export interface EsriFloorLayerView {
  filter?: { where?: string } | null
  watch?: (name: string, cb: () => void) => { remove?: () => void }
}

export interface EsriFloorHit {
  results?: Array<{
    graphic?: EsriFloorGraphic | null
  }>
}

export interface EsriFloorGraphic {
  attributes?: Record<string, unknown> | null
  layer?: EsriLayerLike | null
}

const floorGeneration = new WeakMap<object, number>()
const watchedFloorLayers = new WeakSet<object>()
const watchedLayerViews = new WeakSet<object>()
const watchedVisibility = new WeakSet<object>()
const sourceExpression = new WeakMap<object, string | null>()
const layerFloorField = new WeakMap<object, string>()
const floorClause = new WeakMap<object, string | null>()
const floorValues = new WeakMap<object, Map<string, ReadonlySet<string>>>()
const intendedVisible = new WeakMap<object, boolean>()

function mapOf (view: EsriFloorView | null | undefined): EsriLayerMap | null {
  return view?.map ?? null
}

function floorLayers (view: EsriFloorView | null | undefined): EsriFloorLayer[] {
  return esriLayersOf(mapOf(view)).filter((layer): layer is EsriFloorLayer =>
    Boolean(layer.fields?.length || layer.definitionExpression || layer.floorInfo)
  )
}

function fieldName (layer: EsriLayerLike, name: string): string | undefined {
  const fields = (layer as EsriFloorLayer).fields
  if (!fields) return undefined
  const target = name.toUpperCase()
  const found = fields.find((field) => field.name?.toUpperCase() === target)
  const field = found?.name
  return field && /^[A-Za-z_][A-Za-z0-9_]*$/.test(field) ? field : undefined
}

function sqlString (value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

interface FloorSelector {
  field: string
  operator: '=' | 'IN'
  literals: string[]
}

function rememberedExpression (layer: EsriFloorLayer): string | null {
  if (!sourceExpression.has(layer)) {
    sourceExpression.set(layer, layer.definitionExpression ?? null)
  }
  return sourceExpression.get(layer) ?? null
}

function attr (row: Record<string, unknown>, field: string): unknown {
  if (field in row) return row[field]
  const target = field.toUpperCase()
  for (const key of Object.keys(row)) {
    if (key.toUpperCase() === target) return row[key]
  }
  return undefined
}

function asNumber (value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/** Equality and IN clauses in the map's own definition expression. */
export function floorSelectors (expression: string | null | undefined): FloorSelector[] {
  const selectors: FloorSelector[] = []
  for (const clause of splitTopLevelAnd(expression || '')) {
    const text = unwrapParens(clause)
    const equal = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*('(?:''|[^'])*'|-?\d+(?:\.\d+)?)$/)
    if (equal) {
      selectors.push({ field: equal[1], operator: '=', literals: [unquote(equal[2])] })
      continue
    }
    const list = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s+IN\s*\(([^)]*)\)$/i)
    if (!list) continue
    const literals = list[2]
      .split(',')
      .map((part) => unquote(part.trim()))
      .filter((part) => part !== '')
    if (literals.length) selectors.push({ field: list[1], operator: 'IN', literals })
  }
  return selectors
}

function unquote (literal: string): string {
  if (literal.startsWith("'") && literal.endsWith("'")) {
    return literal.slice(1, -1).replace(/''/g, "'")
  }
  return literal
}

function sqlLiteral (value: string, sample?: string): string {
  if (sample != null && /^-?\d+(?:\.\d+)?$/.test(sample) && /^-?\d+(?:\.\d+)?$/.test(value)) {
    return value
  }
  return sqlString(value)
}

function selectorsFor (layer: EsriFloorLayer): FloorSelector[] {
  const declared = layer.floorInfo?.field
  const parsed = floorSelectors(rememberedExpression(layer))
  if (!declared) return parsed
  const named = fieldName(layer, declared) || declared
  const matching = parsed.filter((selector) => selector.field.toUpperCase() === named.toUpperCase())
  return matching.length ? matching : [{ field: named, operator: '=', literals: [] }]
}

/**
 * LEVEL_ID and FLOOR_CODE. State and NAME are geographic filters, not floors.
 * Clearing State = 'Hawaii' reloads the national tract service.
 */
function looksLikeFloorField (name: string): boolean {
  return /level|floor/i.test(name)
}

/**
 * The floor field is the one the map already filters on: floorInfo, or a
 * floor-like equality/IN clause. A field used that way on two layers is the
 * map's floor filter even if one expression was already cleared. A shared
 * State = 'Hawaii' clause is a geographic filter, not a floor.
 */
export function floorFieldsOf (layers: readonly EsriFloorLayer[]): string[] {
  const fields: string[] = []
  const seen = new Set<string>()
  const add = (field: string | undefined) => {
    if (!field || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) return
    const key = field.toUpperCase()
    if (seen.has(key)) return
    seen.add(key)
    fields.push(field)
  }
  const shared = new Map<string, { field: string, layers: Set<string> }>()
  for (const layer of layers) {
    add(layer.floorInfo?.field)
    add(layerFloorField.get(layer))
    for (const selector of selectorsFor(layer)) {
      const key = selector.field.toUpperCase()
      const group = shared.get(key) ?? { field: selector.field, layers: new Set<string>() }
      group.layers.add(layer.id || layer.title || key)
      shared.set(key, group)
    }
  }
  for (const group of shared.values()) {
    if (group.layers.size >= 2 && looksLikeFloorField(group.field)) add(group.field)
  }
  return fields
}

function candidateFloorFields (layers: readonly EsriFloorLayer[]): string[] {
  const fields = floorFieldsOf(layers)
  const seen = new Set(fields.map((field) => field.toUpperCase()))
  for (const layer of layers) {
    for (const selector of selectorsFor(layer)) {
      // A one-layer NAME = 'Hawaii' clause is not a floor catalog.
      // Querying it clears the filter before any order field is found.
      if (!looksLikeFloorField(selector.field)) continue
      const key = selector.field.toUpperCase()
      if (seen.has(key)) continue
      seen.add(key)
      fields.push(selector.field)
    }
  }
  return fields
}

const FLOOR_SQL_WORDS = new Set([
  'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'BETWEEN', 'TRUE', 'FALSE'
])

function unwrapParens (expression: string): string {
  let text = expression.trim()
  while (text.startsWith('(') && text.endsWith(')') && wrapsWhole(text)) {
    text = text.slice(1, -1).trim()
  }
  return text
}

function wrapsWhole (text: string): boolean {
  let depth = 0
  let quote = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === "'") {
      if (quote && text[i + 1] === "'") {
        i += 1
        continue
      }
      quote = !quote
      continue
    }
    if (quote) continue
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth === 0 && i !== text.length - 1) return false
    }
  }
  return depth === 0
}

function splitTopLevelAnd (expression: string): string[] {
  const text = unwrapParens(expression)
  const parts: string[] = []
  let depth = 0
  let quote = false
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === "'") {
      if (quote && text[i + 1] === "'") {
        i += 1
        continue
      }
      quote = !quote
      continue
    }
    if (quote) continue
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    else if (depth === 0 && text.slice(i, i + 5).toUpperCase() === ' AND ') {
      parts.push(text.slice(start, i).trim())
      i += 4
      start = i + 1
    }
  }
  const tail = text.slice(start).trim()
  if (tail) parts.push(tail)
  return parts
}

function isFloorClause (clause: string, floorFields: readonly string[]): boolean {
  const wanted = new Set(floorFields.map((field) => field.toUpperCase()))
  if (!wanted.size) return false
  const unquoted = clause.replace(/'(?:''|[^'])*'/g, ' ')
  const names: string[] = unquoted.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []
  const fields = names.filter((name) => !FLOOR_SQL_WORDS.has(name.toUpperCase()))
  return fields.length > 0 && fields.every((name) => wanted.has(name.toUpperCase()))
}

/**
 * Drop clauses on the fields the map itself uses to pick a floor. Other
 * filters stay. An empty field list drops nothing: a where is not a floor
 * filter just because this building uses LEVEL_ID.
 */
export function withoutFloorFilter (
  expression: string | null | undefined,
  floorFields: readonly string[] = []
): string | null {
  if (!expression?.trim()) return null
  if (!floorFields.length) return expression
  const clauses = splitTopLevelAnd(expression)
  if (!clauses.some((clause) => isFloorClause(clause, floorFields))) return expression
  const kept = clauses.filter((clause) => !isFloorClause(clause, floorFields))
  if (!kept.length) return null
  return kept.map((clause) => `(${unwrapParens(clause)})`).join(' AND ')
}

function writeExpression (layer: EsriFloorLayer, expression: string | null): void {
  if (typeof layer.setDefinitionExpression === 'function') {
    layer.setDefinitionExpression(expression)
  }
  try {
    layer.definitionExpression = expression
  } catch {
    // A wrapper that only accepts setDefinitionExpression still cleared.
  }
}

function clearFloorExpression (layer: EsriFloorLayer, floorFields: readonly string[]): void {
  const kept = withoutFloorFilter(layer.definitionExpression, floorFields)
  if ((layer.definitionExpression ?? null) === kept) return
  writeExpression(layer, kept)
  watchFloorExpression(layer, floorFields)
}

function watchFloorExpression (layer: EsriFloorLayer, floorFields: readonly string[]): void {
  const watchable = layer as EsriFloorLayer & {
    watch?: (name: string, cb: () => void) => unknown
  }
  if (typeof watchable.watch !== 'function' || watchedFloorLayers.has(layer)) return
  watchedFloorLayers.add(layer)
  watchable.watch('definitionExpression', () => {
    // The web map can write its published floor filter back. Clearing that
    // clause can also drop the layer-view filter, which is what draws a
    // hidden floor on the next click. Put the view filter back.
    clearFloorExpression(layer, floorFields)
    const clause = floorClause.get(layer)
    if (clause === undefined) return
    const owner = layerViewOwner.get(layer)
    if (owner) void applyViewFilter(owner, layer, clause)
  })
}

const layerViewOwner = new WeakMap<object, EsriFloorView>()

const restoringFilter = new WeakSet<object>()
const writtenClause = new WeakMap<object, string | null>()

function writeViewFilter (layerView: EsriFloorLayerView, clause: string | null): void {
  if (restoringFilter.has(layerView)) return
  const readable = layerView.filter
  if (readable && (readable.where ?? null) === clause) return
  // A setter-only view reads as empty. Do not skip a clear in that case,
  // or a click can leave the previous floor's clause in place.
  if (!readable && clause == null && writtenClause.get(layerView) == null && writtenClause.has(layerView)) {
    return
  }
  restoringFilter.add(layerView)
  try {
    layerView.filter = clause ? { where: clause } : null
    writtenClause.set(layerView, clause)
  } finally {
    restoringFilter.delete(layerView)
  }
}

async function applyViewFilter (
  view: EsriFloorView | null | undefined,
  layer: EsriFloorLayer,
  clause: string | null
): Promise<void> {
  floorClause.set(layer, clause)
  if (view) layerViewOwner.set(layer, view)
  if (typeof view?.whenLayerView !== 'function') return
  try {
    const layerView = await view.whenLayerView(layer)
    if (!layerView) return
    writeViewFilter(layerView, clause)
    if (typeof layerView.watch !== 'function' || watchedLayerViews.has(layerView)) return
    watchedLayerViews.add(layerView)
    layerView.watch('filter', () => {
      const wanted = floorClause.get(layer)
      if (wanted === undefined) return
      writeViewFilter(layerView, wanted)
    })
  } catch {
    // The layer view is not ready. The next layer change applies it.
  }
}

/** Put the selected floor's view filter back. A click can clear it. */
export async function reapplyFloorFilters (view: EsriFloorView | null | undefined): Promise<void> {
  if (!view) return
  enforceHiddenLayers(view)
  const layers = floorLayers(view)
  await Promise.all(layers.map((layer) => {
    const clause = floorClause.get(layer)
    if (clause === undefined) return Promise.resolve()
    return applyViewFilter(view, layer, clause)
  }))
}

/**
 * A hidden floor or a source whose eye is off is not a click target. The
 * legend toggle is the source of truth; a map click must not reveal it.
 */
export function featureIsClickable (
  graphic: EsriFloorGraphic | null | undefined,
  view: EsriFloorView | null | undefined
): boolean {
  if (!graphic) return false
  const layer = graphic.layer
  if (layer && intendedVisible.get(layer) === false) return false
  if (layer?.visible === false) return false
  const allowed = view ? floorValues.get(view) : undefined
  if (!allowed?.size) return true
  const attributes = graphic.attributes || {}
  for (const [field, values] of allowed) {
    const raw = attr(attributes, field)
    if (raw == null || String(raw).trim() === '') continue
    if (!values.has(String(raw).trim())) return false
  }
  return true
}

/**
 * Restore hidden floors before the hit test, then drop hits that are not on
 * the selected floor. Replaces `view.hitTest` until the disposer runs.
 */
export function guardFloorClicks (view: EsriFloorView | null | undefined): () => void {
  if (!view) {
    return () => {
      // No view, so there is no click to guard.
    }
  }
  const original = view.hitTest?.bind(view) as EsriFloorView['hitTest']
  if (original) {
    view.hitTest = async (event) => {
      await reapplyFloorFilters(view)
      const hit = await original(event)
      if (!hit?.results) return hit
      return {
        ...hit,
        results: hit.results.filter((result) => featureIsClickable(result.graphic, view))
      }
    }
  }
  const restore = () => {
    void reapplyFloorFilters(view)
  }
  const click = view.on?.('click', restore)
  const down = view.on?.('pointer-down', restore)
  return () => {
    click?.remove?.()
    down?.remove?.()
    if (original) view.hitTest = original
  }
}

function layerHasField (layer: EsriFloorLayer, field: string): boolean {
  return fieldName(layer, field) != null
}

function discoverOrderField (
  layer: EsriFloorLayer,
  rows: Array<Record<string, unknown>>,
  floorField: string
): string | undefined {
  const objectId = layer.objectIdField?.toUpperCase()
  let best: { name: string, span: number, min: number } | undefined
  for (const field of layer.fields || []) {
    const name = field.name
    if (!name || name.toUpperCase() === floorField.toUpperCase()) continue
    if (objectId && name.toUpperCase() === objectId) continue
    const byFloor = new Map<string, number>()
    const used = new Set<number>()
    let ok = rows.length > 0
    for (const row of rows) {
      const id = String(attr(row, floorField) ?? '').trim()
      const ordinal = asNumber(attr(row, name))
      if (!id || ordinal == null) {
        ok = false
        break
      }
      const previous = byFloor.get(id)
      if (previous != null && previous !== ordinal) {
        ok = false
        break
      }
      byFloor.set(id, ordinal)
    }
    if (!ok || byFloor.size < 1) continue
    for (const ordinal of byFloor.values()) {
      if (used.has(ordinal)) {
        ok = false
        break
      }
      used.add(ordinal)
    }
    if (!ok) continue
    const nums = [...used]
    const span = Math.max(...nums) - Math.min(...nums)
    const min = Math.min(...nums)
    if (!best || span < best.span || (span === best.span && min < best.min)) {
      best = { name, span, min }
    }
  }
  return best?.name
}

async function catalogRows (
  layers: readonly EsriFloorLayer[],
  floorField: string
): Promise<{ layer: EsriFloorLayer, rows: Array<Record<string, unknown>> } | null> {
  const candidates = layers.filter((layer) =>
    layerHasField(layer, floorField) && layer.createQuery && layer.queryFeatures
  )
  let best: { layer: EsriFloorLayer, rows: Array<Record<string, unknown>> } | null = null
  for (const layer of candidates) {
    clearFloorExpression(layer, [floorField])
    const query = layer.createQuery?.()
    if (!query) continue
    query.where = '1=1'
    query.outFields = ['*']
    query.returnGeometry = false
    query.num = 2000
    const result = await layer.queryFeatures?.(query)
    const rows = (result?.features || [])
      .map((feature) => feature.attributes || {})
      .filter((row) => String(attr(row, floorField) ?? '').trim())
    if (!rows.length) continue
    if (!discoverOrderField(layer, rows, floorField)) continue
    // First catalog that can order floors. A later, shorter table must
    // not replace it; that would change which level names are queried.
    if (!best) best = { layer, rows }
  }
  return best
}

async function valuesForOrdinal (
  layers: readonly EsriFloorLayer[],
  floorField: string,
  ordinal: number
): Promise<string[] | null> {
  const found = await catalogRows(layers, floorField)
  if (!found) return null
  const orderField = discoverOrderField(found.layer, found.rows, floorField)
  if (!orderField) return null
  const values = found.rows
    .filter((row) => asNumber(attr(row, orderField)) === Math.trunc(ordinal))
    .map((row) => String(attr(row, floorField) ?? '').trim())
    .filter(Boolean)
  return values.length ? [...new Set(values)] : null
}

function rewrittenClause (selector: FloorSelector, values: readonly string[]): string {
  const field = selector.field
  if (values.length === 1 && selector.operator === '=') {
    return `${field} = ${sqlLiteral(values[0], selector.literals[0])}`
  }
  return `${field} IN (${values.map((value) => sqlLiteral(value, selector.literals[0])).join(', ')})`
}

function viewClause (
  layer: EsriFloorLayer,
  floorFields: readonly string[],
  valuesByField: ReadonlyMap<string, readonly string[]>
): string | null {
  const selectors = selectorsFor(layer).filter((selector) =>
    floorFields.some((field) => field.toUpperCase() === selector.field.toUpperCase())
  )
  const clauses: string[] = []
  for (const field of floorFields) {
    if (!layerHasField(layer, field) &&
      !selectors.some((selector) => selector.field.toUpperCase() === field.toUpperCase())) {
      continue
    }
    const values = valuesByField.get(field.toUpperCase())
    if (!values?.length) continue
    const selector = selectors.find((item) => item.field.toUpperCase() === field.toUpperCase()) ||
      { field, operator: '=' as const, literals: [] }
    clauses.push(rewrittenClause(selector, values))
    layerFloorField.set(layer, selector.field)
  }
  return clauses.length ? clauses.join(' AND ') : null
}

/**
 * Show the selected floor using the map's own filter. The field and the
 * clause shape come from definitionExpression or floorInfo, not from a
 * fixed indoor schema. The clause is a layer-view filter so the layer is
 * not reloaded with only that floor.
 */
export async function setEsriFloor (
  view: EsriFloorView | null | undefined,
  ordinal: number | null
): Promise<number> {
  const layers = floorLayers(view)
  if (!view || !layers.length) return 0
  for (const layer of layers) rememberedExpression(layer)
  const ticket = (floorGeneration.get(view) ?? 0) + 1
  floorGeneration.set(view, ticket)
  const candidates = candidateFloorFields(layers)
  if (!candidates.length) return 0
  if (ordinal == null) {
    const marked = layers
      .map((layer) => layerFloorField.get(layer))
      .filter((field): field is string => Boolean(field))
    const fields = [...floorFieldsOf(layers), ...marked]
    floorValues.delete(view)
    for (const layer of layers) clearFloorExpression(layer, fields)
    for (const layer of layers) await applyViewFilter(view, layer, null)
    return layers.length
  }
  const valuesByField = new Map<string, readonly string[]>()
  const confirmed: string[] = []
  for (const field of candidates) {
    const values = await valuesForOrdinal(layers, field, ordinal)
    if (floorGeneration.get(view) !== ticket) return 0
    if (!values?.length) continue
    valuesByField.set(field.toUpperCase(), values)
    confirmed.push(field)
  }
  if (!confirmed.length) return 0
  if (floorGeneration.get(view) !== ticket) return 0
  const allowed = new Map<string, ReadonlySet<string>>()
  for (const [field, values] of valuesByField) allowed.set(field, new Set(values))
  floorValues.set(view, allowed)
  let applied = 0
  for (const layer of layers) {
    clearFloorExpression(layer, confirmed)
    const clause = viewClause(layer, confirmed, valuesByField)
    if (!clause) continue
    await applyViewFilter(view, layer, clause)
    applied += 1
  }
  return applied
}

/** Re-apply a floor filter when the web map finishes loading its layers. */
export function onEsriLayerChange (
  view: EsriFloorView | null | undefined,
  listener: () => void
): () => void {
  const handle = view?.map?.allLayers?.on?.('change', listener)
  return () => handle?.remove?.()
}
