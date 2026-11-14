/**
 * Room-name text drawn on the Esri map. The embed paints these as MapLibre
 * symbol layers from the rules output, not from the service display field.
 * A Sites NAME such as "Esri Redlands Main Campus" is not a room caption.
 */
import { WEB_MERCATOR_HALF_WORLD, webMercatorToLonLat } from './spatialReference'

export const AUDIOM_LABEL_LAYER_ID = 'audiom-labels'

export interface LabelGeometry {
  type?: string
  coordinates?: unknown
  x?: number
  y?: number
  longitude?: number
  latitude?: number
  rings?: number[][][]
  paths?: number[][][]
}

export interface LabelFeature {
  attributes?: Record<string, unknown>
  geometry?: LabelGeometry
}

export interface LabelGraphicSpec {
  text: string
  x: number
  y: number
  priority?: number
  size?: number
  padding?: number
  color?: string
  haloColor?: string
  haloSize?: number
  fontFamily?: string
  allowOverlap?: boolean
  properties?: Record<string, unknown>
}

export interface ScreenLabel extends LabelGraphicSpec {
  screenX: number
  screenY: number
}

/**
 * Honor the embed layer's text-allow-overlap and text-padding. The padding
 * and size are the values that layer already computed.
 */
export function thinLabels (labels: readonly ScreenLabel[]): ScreenLabel[] {
  const ranked = labels.map((label, index) => ({ label, index }))
  ranked.sort((left, right) => (left.label.priority ?? 2) - (right.label.priority ?? 2) || left.index - right.index)
  const kept: Array<{ x: number, y: number, width: number, height: number }> = []
  const placed: ScreenLabel[] = []
  for (const item of ranked) {
    if (item.label.allowOverlap) {
      placed.push(item.label)
      continue
    }
    const fontSize = item.label.size ?? 12
    const padding = item.label.padding ?? 0
    const width = Math.max(fontSize, item.label.text.length * fontSize * 0.5) + padding * 2
    const height = fontSize + padding * 2
    const x = item.label.screenX - width / 2
    const y = item.label.screenY - height / 2
    const overlaps = kept.some((other) =>
      x < other.x + other.width && x + width > other.x &&
      y < other.y + other.height && y + height > other.y
    )
    if (overlaps) continue
    kept.push({ x, y, width, height })
    placed.push(item.label)
  }
  return placed
}

function textOf (value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value !== 'string') return ''
  return value.trim()
}

function meaningful (value: string): boolean {
  return Boolean(value) && value.toLowerCase() !== 'unlabeled'
}

export interface LabelOptions {
  /** Units layer. The rules file copies NAME for these rows. */
  roomLayer?: boolean
  /** Do not label every floor when the selected level matches nothing. */
  strictLevel?: boolean
}

function useTypeOf (attributes: Record<string, unknown>): string {
  return textOf(attributes.USE_TYPE) || textOf(attributes.use_type)
}

function isLevelFeature (attributes: Record<string, unknown>): boolean {
  const ruleType = textOf(attributes.ruleType).toLowerCase()
  const useType = useTypeOf(attributes).toLowerCase()
  return ruleType === 'level' || useType === 'level'
}

/**
 * The caption the embed prints. A rules `name` wins ("201A (Level 2)").
 * When the rules file has not been stamped yet, a Units row still uses the
 * expression that file writes: NAME, then " (levelName)". A Sites NAME such
 * as "Esri Redlands Main Campus" is not a room and is not a caption.
 */
export function labelText (
  attributes: Record<string, unknown> | null | undefined,
  options?: LabelOptions
): string | null {
  if (!attributes || isLevelFeature(attributes)) return null
  if (attributes.directionSymbol != null && textOf(attributes.directionSymbol)) return null
  const ruled = Boolean(textOf(attributes.ruleType) || textOf(attributes.ruleName))
  const room = Boolean(options?.roomLayer) || Boolean(useTypeOf(attributes))
  // A floor ordinal means this row is a room, not the campus polygon.
  const onFloor = featureLevel(attributes) != null
  for (const field of ['name', 'Label', 'Name']) {
    const value = textOf(attributes[field])
    if (meaningful(value)) return value
  }
  if (ruled) {
    for (const field of ['ruleName', 'ruleType']) {
      const value = textOf(attributes[field])
      if (meaningful(value) && value.toLowerCase() !== 'level') return value
    }
  }
  if (!room && !onFloor) return null
  const roomName = textOf(attributes.NAME) || textOf(attributes.NAME_LONG)
  if (!meaningful(roomName)) return null
  const levelName = textOf(attributes.levelName)
  if (levelName && !roomName.includes(levelName)) return `${roomName} (${levelName})`
  return roomName
}

export function featureLevel (attributes: Record<string, unknown> | null | undefined): number | null {
  const raw = attributes?.levelOrdinal ?? attributes?.level
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/** Queries sometimes leave meters in a geometry that claims to be geographic. */
export function toLonLat (x: number, y: number): { x: number, y: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return { x, y }
  if (Math.abs(x) > WEB_MERCATOR_HALF_WORLD || Math.abs(y) > WEB_MERCATOR_HALF_WORLD) return null
  const { longitude, latitude } = webMercatorToLonLat(x, y)
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return null
  return { x: longitude, y: latitude }
}

function ringArea (ring: number[][]): number {
  let area = 0
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index]
    const next = ring[(index + 1) % ring.length]
    area += x1 * next[1] - next[0] * y1
  }
  return Math.abs(area) / 2
}

function ringCentroid (ring: number[][]): { x: number, y: number } | null {
  if (ring.length < 3) return null
  // Shoelace is unstable on a room a few meters across in longitude/latitude:
  // the centroid landed hundreds of meters away and every name was culled.
  const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
  const count = closed ? ring.length - 1 : ring.length
  let x = 0
  let y = 0
  for (let index = 0; index < count; index += 1) {
    x += ring[index][0]
    y += ring[index][1]
  }
  return toLonLat(x / count, y / count)
}

function largestRing (rings: number[][][] | undefined): number[][] | null {
  let best: number[][] | null = null
  let bestArea = -1
  for (const ring of rings || []) {
    if (ring.length < 3) continue
    const area = ringArea(ring)
    if (area > bestArea) {
      best = ring
      bestArea = area
    }
  }
  return best
}

function pathMidpoint (paths: number[][][] | undefined): { x: number, y: number } | null {
  let best: number[][] | null = null
  let bestLength = -1
  for (const path of paths || []) {
    if (path.length < 2) continue
    if (path.length > bestLength) {
      best = path
      bestLength = path.length
    }
  }
  if (!best) return null
  const middle = best[Math.floor(best.length / 2)]
  return toLonLat(middle[0], middle[1])
}

function geoJsonAnchor (geometry: LabelGeometry): { x: number, y: number } | null {
  const type = (geometry.type || '').toLowerCase()
  const coordinates = geometry.coordinates
  if (!type || !Array.isArray(coordinates)) return null
  if (type === 'point') {
    const pair = coordinates as number[]
    return toLonLat(pair[0], pair[1])
  }
  if (type === 'linestring') return pathMidpoint([coordinates as number[][]])
  if (type === 'multilinestring') return pathMidpoint(coordinates as number[][][])
  if (type === 'polygon') {
    const ring = largestRing(coordinates as number[][][])
    return ring ? ringCentroid(ring) : null
  }
  if (type === 'multipolygon') {
    const rings = (coordinates as number[][][][]).map((polygon) => polygon[0]).filter((ring) => ring?.length)
    const ring = largestRing(rings)
    return ring ? ringCentroid(ring) : null
  }
  return null
}

/** A point inside the room, in longitude and latitude. */
export function labelAnchor (geometry: LabelGeometry | null | undefined): { x: number, y: number } | null {
  if (!geometry) return null
  if (typeof geometry.longitude === 'number' && typeof geometry.latitude === 'number') {
    return toLonLat(geometry.longitude, geometry.latitude)
  }
  const geoJson = geoJsonAnchor(geometry)
  if (geoJson) return geoJson
  const ring = largestRing(geometry.rings)
  if (ring) return ringCentroid(ring)
  const line = pathMidpoint(geometry.paths)
  if (line) return line
  if (typeof geometry.x === 'number' && typeof geometry.y === 'number') {
    return toLonLat(geometry.x, geometry.y)
  }
  const box = geometry as {
    xmin?: number
    ymin?: number
    xmax?: number
    ymax?: number
    extent?: { xmin?: number, ymin?: number, xmax?: number, ymax?: number }
  }
  const extent = box.extent && typeof box.extent.xmin === 'number' ? box.extent : box
  if (
    typeof extent.xmin === 'number' && typeof extent.xmax === 'number' &&
    typeof extent.ymin === 'number' && typeof extent.ymax === 'number'
  ) {
    return toLonLat((extent.xmin + extent.xmax) / 2, (extent.ymin + extent.ymax) / 2)
  }
  return null
}

function captionsFor (
  features: readonly LabelFeature[],
  level: number | null,
  options?: LabelOptions
): LabelGraphicSpec[] {
  const active = level != null && Number.isFinite(level) ? level : null
  const specs: LabelGraphicSpec[] = []
  const seen = new Set<string>()
  for (const feature of features) {
    if (active != null) {
      const ordinal = featureLevel(feature.attributes)
      if (ordinal != null && ordinal !== active) continue
    }
    const text = labelText(feature.attributes, options)
    if (!text) continue
    const anchor = labelAnchor(feature.geometry)
    if (!anchor) continue
    const key = `${text}@${anchor.x.toFixed(5)},${anchor.y.toFixed(5)}`
    if (seen.has(key)) continue
    seen.add(key)
    const properties = { ...(feature.attributes || {}) }
    if (!properties.name && !properties.Name && !properties.Label) properties.name = text
    specs.push({ text, x: anchor.x, y: anchor.y, properties })
  }
  return specs
}

/**
 * Captions for one layer. A selected floor wins when it has rooms. A level
 * that matches nothing does not blank the map, unless the caller already
 * limited the query to the drawn floor.
 */
export function labelsForFeatures (
  features: readonly LabelFeature[] | null | undefined,
  level: number | null,
  options?: LabelOptions
): LabelGraphicSpec[] {
  const list = features || []
  const selected = captionsFor(list, level, options)
  if (options?.strictLevel || selected.length || level == null) return selected
  return captionsFor(list, null, options)
}

/** Dark text on a light halo, unless the vector style is hidden. Matches the embed. */
export function labelSymbolPaint (mode: string | undefined, text: string, size = 12): {
  text: string
  color: string
  haloColor: string
  haloSize: number
  horizontalAlignment: string
  verticalAlignment: string
  font: { size: number, family: string, weight: string }
} {
  const hidden = mode === 'none' || mode === 'hidden'
  const fontSize = Number.isFinite(size) ? size : 12
  return {
    text,
    color: hidden ? '#ffffff' : '#1f2933',
    haloColor: hidden ? '#000000' : '#ffffff',
    haloSize: hidden ? 2 : 1.5,
    horizontalAlignment: 'center',
    verticalAlignment: 'middle',
    font: { size: fontSize, family: 'Arial', weight: 'normal' }
  }
}