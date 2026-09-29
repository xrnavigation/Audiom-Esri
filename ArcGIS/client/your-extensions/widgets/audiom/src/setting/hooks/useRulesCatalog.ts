import { React } from 'jimu-core'
import { RulesCatalogStatus } from '../enums'

export interface RulesCatalogItem {
  id: number
  name: string
  slug: string
  url: string
}

export interface RulesCatalog {
  status: RulesCatalogStatus
  items: RulesCatalogItem[]
}

/** One catalog request shared by the bulk picker and every source picker. */
export function useRulesCatalog (baseUrl: string, apiKey: string): RulesCatalog {
  const [result, setResult] = React.useState<{ baseUrl: string; apiKey: string; catalog: RulesCatalog }>()
  React.useEffect(() => {
    if (!apiKey || !baseUrl) return
    const controller = new AbortController()
    let active = true
    const update = (catalog: RulesCatalog) => {
      if (active) setResult({ baseUrl, apiKey, catalog })
    }
    update({ status: RulesCatalogStatus.Loading, items: [] })
    async function load () {
      try {
        const endpoint = new URL('/api/rules', baseUrl)
        const response = await fetch(endpoint.toString(), {
          headers: { 'X-API-Key': apiKey },
          signal: controller.signal,
          credentials: 'omit'
        })
        if (!response.ok) throw new Error('Catalog request failed')
        const body = await response.json()
        if (!Array.isArray(body.data) || !body.data.every((item: RulesCatalogItem) =>
          item && Number.isSafeInteger(item.id) && typeof item.name === 'string' &&
          typeof item.slug === 'string' && typeof item.url === 'string')) {
          throw new Error('Invalid catalog response')
        }
        update({ status: RulesCatalogStatus.Ready, items: body.data })
      } catch {
        update({ status: RulesCatalogStatus.Error, items: [] })
      }
    }
    void load()
    return () => { active = false; controller.abort() }
  }, [baseUrl, apiKey])

  if (!apiKey || !baseUrl) return { status: RulesCatalogStatus.Idle, items: [] }
  // Clear stale options during render, before the effect for new credentials runs.
  if (result?.baseUrl !== baseUrl || result?.apiKey !== apiKey) return { status: RulesCatalogStatus.Loading, items: [] }
  return result.catalog
}
