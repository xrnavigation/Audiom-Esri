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
  features?: Array<{ attributes?: Record<string, unknown> }>
  /** Set when a rules file was evaluated, even if every feature was excluded. */
  rulesRef?: string
}

export interface RulesApplyDeps {
  loadRules: (url: string) => Promise<unknown>
  applyRules: (
    rules: unknown,
    attributes: Array<Record<string, unknown>>,
    geometryType?: string
  ) => Array<Record<string, unknown> | null>
}

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

function textValue (value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** The rules file's name expression, including its augmenters. The role is a sound, not a suffix. */
export function spokenPlaceTitle (place: Record<string, unknown> | null | undefined): string | null {
  if (!place || place.ruleType === 'level') return null
  return textValue(place.name) || textValue(place.ruleName) || null
}

function soundKeys (attributes: Record<string, unknown>): Record<string, unknown> {
  const name = textValue(attributes.name) || textValue(attributes.Name) || textValue(attributes.NAME)
  const ruleName = textValue(attributes.ruleName)
  const ruleType = textValue(attributes.ruleType)
  const place: Record<string, unknown> = {}
  if (name) place.name = name
  if (ruleName) place.ruleName = ruleName
  if (ruleType) place.ruleType = ruleType
  return place
}

/**
 * The room the painted graphic is, in the shape step playback looks up.
 * Rules win. A raw USE_TYPE still names a restroom when the file is slow.
 * Hallway and corridor are walkway samples; the pack has no hallway_step.
 */
export async function soundPlaceForGraphic (
  attributes: Record<string, unknown> | null | undefined,
  rulesUrl: string | undefined
): Promise<Record<string, unknown> | null> {
  if (!attributes) return null
  const direct = soundKeys(attributes)
  if (direct.ruleType || direct.ruleName) return direct
  if (rulesUrl) {
    try {
      const rules = await loadRulesFile(rulesUrl)
      const [output] = evaluateWithRuntime(rules, [{ ...attributes }], 'polygon')
      if (!output) return null
      const stamped = soundKeys(output)
      if (stamped.ruleType || stamped.ruleName || stamped.name) return stamped
    } catch {
      // The use type is still a sound name.
    }
  }
  const useType = textValue(attributes.USE_TYPE) || textValue(attributes.use_type)
  if (!useType && !direct.name) return null
  const key = useType.toLowerCase()
  const ruleType = key === 'hallway' || key === 'corridor'
    ? 'walkway'
    : key.includes('restroom')
      ? 'restroom'
      : undefined
  return {
    ...(direct.name ? { name: direct.name } : {}),
    ...(useType ? { ruleName: useType } : {}),
    ...(ruleType ? { ruleType } : {})
  }
}

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

function evaluateWithRuntime (
  rules: unknown,
  attributes: Array<Record<string, unknown>>,
  geometryType?: string
): Array<Record<string, unknown> | null> {
  // The webpack overlay aliases this id to the Front-End checkout.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const compiled = require('audiom-front-end/runtime/exbEntry') as {
    applyRulesToFeatures?: RulesApplyDeps['applyRules']
  }
  if (!compiled.applyRulesToFeatures) {
    throw new Error('Audiom rules entry is missing')
  }
  return compiled.applyRulesToFeatures(rules, attributes, geometryType)
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
 * copies. Paint reads those copies. A failed fetch leaves the layer alone.
 */
export async function applyConfiguredRules (
  layers: RulesLayer[],
  hints: readonly RulesHint[] | undefined,
  deps: RulesApplyDeps = { loadRules: loadRulesFile, applyRules: evaluateWithRuntime }
): Promise<void> {
  const pending = layers.map(async (layer) => {
    const rulesUrl = rulesUrlForLayer(layer, hints)
    const features = layer.features
    if (!rulesUrl || !features?.length) return
    let rules: unknown
    try {
      rules = await deps.loadRules(rulesUrl)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Audiom could not load rules', rulesUrl, error)
      return
    }
    let outputs: Array<Record<string, unknown> | null>
    try {
      outputs = deps.applyRules(
        rules,
        features.map((feature) => ({ ...(feature.attributes || {}) })),
        layer.geometryType
      )
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Audiom could not apply rules', rulesUrl, error)
      return
    }
    const matched = outputs.filter((output) => output != null).length
    layer.rulesRef = rulesUrl
    if (!matched) return
    layer.features = features.flatMap((feature, index) => {
      const output = outputs[index]
      if (!output) return []
      return [{ ...feature, attributes: mergeAttributes(feature.attributes, output) }]
    })
  })
  await Promise.all(pending)
}
