export interface RulesHint {
  id?: string
  title?: string
  url?: string
  rulesFileUrl?: string
}

export interface RulesLayer {
  id?: string
  title?: string
  url?: string
  geometryType?: string
  features?: Array<{ attributes?: Record<string, unknown>, geometry?: unknown }>
  /** Set when a rules file was evaluated, even if every feature was excluded. */
  rulesRef?: string
}

/**
 * Rule outputs for each attribute row, null where the rules exclude it.
 * The widget passes the runtime's evaluateRecords, so the paint uses the
 * same rules engine as the audio map.
 */
export type EvaluateRules = (
  rulesUrl: string,
  layer: RulesLayer,
  attributes: Array<Record<string, unknown>>
) => Promise<Array<Record<string, unknown> | null>>

const rulesCache = new Map<string, Promise<unknown>>()

/**
 * A root-relative rules path is served by the Audiom app, the same origin the
 * embed iframe uses. Experience Builder is a different origin, so `/rules/...`
 * must not be fetched from the widget page itself.
 */
export function resolveRulesFileUrl (
  value: string | undefined,
  origins: ReadonlyArray<string | undefined>
): string {
  const raw = value?.trim() || ''
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  const origin = origins.map((item) => item?.trim()).find(Boolean)
  if (!origin) return raw
  try {
    const base = origin.endsWith('/') ? origin : `${origin}/`
    return new URL(raw, base).toString()
  } catch {
    return raw
  }
}

function sameResource (left: string, right: string): boolean {
  if (!left || !right) return false
  return left === right || left.startsWith(right) || right.startsWith(left)
}

/** The rules file configured for this layer. Empty when none is configured. */
export function rulesUrlForLayer (
  layer: RulesLayer,
  hints: readonly RulesHint[] | undefined
): string {
  if (!hints?.length) return ''
  const id = layer.id || ''
  const title = layer.title || ''
  const url = layer.url || ''
  const matches = hints.filter((item) => {
    const rules = item.rulesFileUrl?.trim()
    if (!rules) return false
    if (item.id && id && item.id === id) return true
    if (item.url && url && sameResource(url, item.url)) return true
    if (item.title && title && item.title === title) return true
    return false
  })
  if (matches.length === 1) return matches[0].rulesFileUrl?.trim() || ''
  if (matches.length > 1) {
    const byId = matches.find((item) => item.id && item.id === id)
    return (byId || matches[0]).rulesFileUrl?.trim() || ''
  }
  const configured = [...new Set(
    hints.map((item) => item.rulesFileUrl?.trim()).filter((item): item is string => Boolean(item))
  )]
  // Experience Builder layer ids often differ from the source id, and a web
  // map of one building uses one rules file. Apply that file when it is the
  // only one configured.
  return configured.length === 1 ? configured[0] : ''
}

/** The rules file at `url`, fetched once. The runtime resolves rulesRef through this. */
export function loadRulesFile (url: string): Promise<unknown> {
  const cached = rulesCache.get(url)
  if (cached) return cached
  const pending = fetch(url, { credentials: 'omit' }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Audiom rules ${response.status} ${url}`)
    }
    return response.json() as Promise<unknown>
  })
  rulesCache.set(url, pending)
  pending.catch(() => {
    rulesCache.delete(url)
  })
  return pending
}

function mergeAttributes (
  attributes: Record<string, unknown> | undefined,
  output: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(attributes || {}) }
  for (const [key, value] of Object.entries(output)) {
    if (value == null) continue
    if (typeof value === 'object' && !Array.isArray(value)) continue
    next[key] = value
  }
  return next
}

/**
 * Evaluate each layer's rules file and stamp the outputs onto the queried
 * copies. Paint reads those copies. A failed evaluation leaves the layer alone.
 */
export async function applyConfiguredRules (
  layers: RulesLayer[],
  hints: readonly RulesHint[] | undefined,
  evaluate: EvaluateRules
): Promise<void> {
  const pending = layers.map(async (layer) => {
    const rulesUrl = rulesUrlForLayer(layer, hints)
    const features = layer.features
    if (!rulesUrl || !features?.length) return
    let outputs: Array<Record<string, unknown> | null>
    try {
      outputs = await evaluate(
        rulesUrl,
        layer,
        features.map((feature) => ({ ...(feature.attributes || {}) }))
      )
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Audiom could not apply rules', rulesUrl, error)
      return
    }
    const matched = outputs.filter((output) => output != null).length
    layer.rulesRef = rulesUrl
    if (!matched) return
    // Esri geometry is a prototype getter. Spreading the graphic drops it,
    // the snapshot then has no plots, and the legend stays empty.
    layer.features = features.flatMap((feature, index) => {
      const output = outputs[index]
      if (!output) return []
      return [{
        attributes: mergeAttributes(feature.attributes, output),
        geometry: feature.geometry
      }]
    })
  })
  await Promise.all(pending)
}
