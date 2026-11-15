import { buildLabelLayers } from '../../../../../../../../Audiom-Front-End/src/hooks/styleHooks'
import {
  createPropertyExpression,
  featureFilter,
  isExpression,
  latest,
  type SymbolLayerSpecification
} from '../../../../../../../../Audiom-Front-End/node_modules/@maplibre/maplibre-gl-style-spec'

/**
 * The embed's generated label layers. Zoom, text, size, padding, and priority
 * come from buildLabelLayers. This file does not restate that ladder.
 */

type PropertySpec = Parameters<typeof createPropertyExpression>[2]
type LabelProperties = Record<string, unknown>
type VectorMode = Parameters<typeof buildLabelLayers>[1]

export interface EmbedLabelStyle {
  text: string
  size: number
  padding: number
  priority: number
  color: string
  haloColor: string
  haloSize: number
  fontFamily: string
  allowOverlap: boolean
}

interface CompiledLayer {
  minzoom?: number
  maxzoom?: number
  padding: number
  allowOverlap: boolean
  fontFamily: string
  matches: (properties: LabelProperties, zoom: number) => boolean
  text: (properties: LabelProperties, zoom: number) => unknown
  size: (properties: LabelProperties, zoom: number) => unknown
  priority: (properties: LabelProperties, zoom: number) => unknown
  color: (properties: LabelProperties, zoom: number) => unknown
  haloColor: (properties: LabelProperties, zoom: number) => unknown
  haloSize: (properties: LabelProperties, zoom: number) => unknown
}

const compiled = new Map<string, CompiledLayer[]>()

function compileProperty (
  value: unknown,
  specification: object,
  layerId: string
): (properties: LabelProperties, zoom: number) => unknown {
  if (!isExpression(value)) return () => value
  // The published spec types `type` as string, wider than the parser's union.
  const parsed = createPropertyExpression(value, layerId, specification as PropertySpec)
  if (parsed.result !== 'success') return () => undefined
  return (properties, zoom) => parsed.value.evaluate({ zoom }, { type: 'Polygon', properties })
}

function fontFamily (value: unknown): string {
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : 'Arial'
}

function compile (mode: string): CompiledLayer[] {
  const cached = compiled.get(mode)
  if (cached) return cached
  const layoutSpec = latest.layout_symbol
  const paintSpec = latest.paint_symbol
  const layers = buildLabelLayers([], mode as VectorMode).flatMap((candidate) => {
    if (candidate.type !== 'symbol') return []
    const layer = candidate as SymbolLayerSpecification
    const layout = layer.layout
    const paint = layer.paint
    if (!layout) return []
    const layerFilter = layer.filter == null ? null : featureFilter(layer.filter, layer.id)
    return [{
      minzoom: layer.minzoom,
      maxzoom: layer.maxzoom,
      padding: typeof layout['text-padding'] === 'number' ? layout['text-padding'] : 0,
      allowOverlap: layout['text-allow-overlap'] === true,
      fontFamily: fontFamily(layout['text-font']),
      matches: (properties: LabelProperties, zoom: number) => {
        if (typeof layer.minzoom === 'number' && zoom < layer.minzoom) return false
        if (typeof layer.maxzoom === 'number' && zoom >= layer.maxzoom) return false
        if (!layerFilter) return true
        return layerFilter.filter({ zoom }, { type: 'Polygon', properties })
      },
      text: compileProperty(layout['text-field'], layoutSpec['text-field'], layer.id),
      size: compileProperty(layout['text-size'], layoutSpec['text-size'], layer.id),
      priority: compileProperty(layout['symbol-sort-key'], layoutSpec['symbol-sort-key'], layer.id),
      color: compileProperty(paint?.['text-color'], paintSpec['text-color'], layer.id),
      haloColor: compileProperty(paint?.['text-halo-color'], paintSpec['text-halo-color'], layer.id),
      haloSize: compileProperty(paint?.['text-halo-width'], paintSpec['text-halo-width'], layer.id)
    }]
  })
  compiled.set(mode, layers)
  return layers
}

function textOf (value: unknown): string | null {
  const text = typeof value === 'string' ? value : sectionText(value)
  if (!text.trim() || text.toLowerCase() === 'unlabeled') return null
  return text
}

function sectionText (value: unknown): string {
  if (!value || typeof value !== 'object' || !('sections' in value)) return ''
  const sections = value.sections
  if (!Array.isArray(sections)) return ''
  return sections.map((section) => {
    if (!section || typeof section !== 'object' || !('text' in section)) return ''
    return typeof section.text === 'string' ? section.text : ''
  }).join('')
}

function numberOf (value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * The label the embed would draw for these properties at this zoom.
 * When more than one of its label layers is visible, the most specific
 * (highest minzoom) wins, so the name is not drawn twice.
 */
export function embedLabelStyle (
  properties: LabelProperties,
  zoom: number,
  mode: string
): EmbedLabelStyle | null {
  if (!Number.isFinite(zoom)) return null
  const layers = compile(mode).filter((layer) => layer.matches(properties, zoom))
  layers.sort((left, right) => (right.minzoom ?? -Infinity) - (left.minzoom ?? -Infinity))
  for (const layer of layers) {
    const text = textOf(layer.text(properties, zoom))
    if (!text) continue
    return {
      text,
      size: numberOf(layer.size(properties, zoom), 12),
      padding: layer.padding,
      priority: numberOf(layer.priority(properties, zoom), 2),
      color: textOf(layer.color(properties, zoom)) ?? '#1f2933',
      haloColor: textOf(layer.haloColor(properties, zoom)) ?? '#ffffff',
      haloSize: numberOf(layer.haloSize(properties, zoom), 1.5),
      fontFamily: layer.fontFamily,
      allowOverlap: layer.allowOverlap
    }
  }
  return null
}
