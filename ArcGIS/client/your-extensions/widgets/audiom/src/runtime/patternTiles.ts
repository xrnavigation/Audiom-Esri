/**
 * Canonical Audiom fill-pattern tiles.
 *
 * Kept in step with Audiom-Front-End/src/runtime/patternTiles.ts. The widget
 * cannot import that file: Experience Builder compiles this folder, and the
 * Front-End module graph must not enter the widget bundle from a symbol helper.
 * The five tokens match Legend/VectorStyleLegend and createPatternImage.
 */
export const PATTERN_TOKENS = [
  'dot-pattern',
  'empty-square-pattern',
  'grid-pattern',
  'diagonal-line-pattern',
  'caret-pattern'
] as const

export type PatternToken = (typeof PATTERN_TOKENS)[number]

const NAVY = '#04203e'

/** SVG bodies drawn to the same geometry as createPatternImage (16px). */
const PATTERN_BODIES: Record<PatternToken, string> = {
  'dot-pattern': `<circle cx="8" cy="8" r="2" fill="${NAVY}"/>`,
  'empty-square-pattern': `<rect x="4" y="4" width="8" height="8" fill="none" stroke="${NAVY}" stroke-width="1"/>`,
  'grid-pattern': `<path d="M0 8H16M8 0V16" stroke="${NAVY}" stroke-width="1" fill="none"/>`,
  'diagonal-line-pattern': `<path d="M0 16L16 0" stroke="${NAVY}" stroke-width="1" fill="none"/>`,
  'caret-pattern': `<path d="M4 12L8 4L12 12" fill="none" stroke="${NAVY}" stroke-width="1"/>`
}

export function isPatternToken (value: unknown): value is PatternToken {
  return typeof value === 'string' && (PATTERN_TOKENS as readonly string[]).includes(value)
}

/** Unknown tokens fall back to dots, matching the legend and the renderer. */
export function patternToken (value: unknown): PatternToken {
  return isPatternToken(value) ? value : 'dot-pattern'
}

export function patternTileSvg (token: unknown, size = 16): string {
  const resolved = patternToken(token)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16">${PATTERN_BODIES[resolved]}</svg>`
}

export function patternTileUrl (token: unknown, size = 16): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(patternTileSvg(token, size))}`
}
