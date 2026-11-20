/**
 * The runtime viewer's strings, from the package's own catalogs. The viewer
 * otherwise fetches `<assetBase>/locales/<locale>/viewer.json`, and the
 * Audiom site does not send CORS headers for those files, so a widget on an
 * Experience Builder host could not read them.
 */
import * as de from '@xrnavigation/audiom-runtime/assets/locales/de/viewer.json'
import * as en from '@xrnavigation/audiom-runtime/assets/locales/en/viewer.json'
import * as es from '@xrnavigation/audiom-runtime/assets/locales/es/viewer.json'
import * as fr from '@xrnavigation/audiom-runtime/assets/locales/fr/viewer.json'
import * as hi from '@xrnavigation/audiom-runtime/assets/locales/hi/viewer.json'
import * as it from '@xrnavigation/audiom-runtime/assets/locales/it/viewer.json'
import * as ko from '@xrnavigation/audiom-runtime/assets/locales/ko/viewer.json'
import * as nl from '@xrnavigation/audiom-runtime/assets/locales/nl/viewer.json'
import * as ptBR from '@xrnavigation/audiom-runtime/assets/locales/pt-BR/viewer.json'
import * as ru from '@xrnavigation/audiom-runtime/assets/locales/ru/viewer.json'
import * as zh from '@xrnavigation/audiom-runtime/assets/locales/zh/viewer.json'

type Catalog = Record<string, unknown>

/**
 * Webpack gives a JSON module as a namespace with `default`; a CommonJS
 * require (the tests) gives the object itself.
 */
function catalog (module: { default?: Catalog }): Catalog {
  return module.default ?? (module as Catalog)
}

export const RUNTIME_TRANSLATIONS: Record<string, Catalog> = {
  en: catalog(en),
  de: catalog(de),
  es: catalog(es),
  fr: catalog(fr),
  hi: catalog(hi),
  it: catalog(it),
  ko: catalog(ko),
  nl: catalog(nl),
  'pt-BR': catalog(ptBR),
  ru: catalog(ru),
  zh: catalog(zh)
}

export const RUNTIME_LOCALES = Object.keys(RUNTIME_TRANSLATIONS)

/**
 * The runtime locale for an Experience Builder locale such as `en-us`,
 * `pt-br` or `zh-cn`. English when the runtime has no catalog for it.
 */
export function runtimeLocale (locale: string | undefined): string {
  const wanted = (locale || '').trim().toLowerCase()
  const exact = RUNTIME_LOCALES.find((item) => item.toLowerCase() === wanted)
  if (exact) return exact
  const language = wanted.split(/[-_]/)[0]
  return RUNTIME_LOCALES.find((item) => item.toLowerCase() === language) || 'en'
}
