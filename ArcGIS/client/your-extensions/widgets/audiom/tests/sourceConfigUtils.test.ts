import {
  replaceAt,
  serializeLockedForDiff,
  getLockedSources,
  getUnlockedSources,
  getUnlockedSourceIds,
  buildUnlockedSourcesMap,
  excludeSourcesByIds,
  mergeSourcesPreservingUnlocked,
  mergeFilters,
  stripUserControlledProperties
} from '../src/utils/sourceConfigUtils'
import type { ISourceConfig, IFilterConfig } from '../src/setting/configs'
import { FilterType } from '../src/setting/enums'
import { MapType } from 'your-extensions/shared/audiom-client/AudiomSource'

const src = (overrides: Partial<ISourceConfig> = {}): ISourceConfig => ({
  source: 'a',
  name: 'A',
  sourceUrl: 'https://example.com/a',
  enabled: true,
  ...overrides
})

const mapFilter = (overrides: Partial<IFilterConfig> = {}): IFilterConfig => ({
  expression: 'pop > 10',
  mapExpression: 'pop > 10',
  filterType: FilterType.Where,
  mapFilterType: FilterType.Where,
  locked: true,
  fromMap: true,
  ...overrides
})

describe('replaceAt', () => {
  it('returns a new array (does not mutate)', () => {
    const arr = [{ x: 1 }, { x: 2 }, { x: 3 }]
    const out = replaceAt(arr, 1, { x: 99 })
    expect(out).not.toBe(arr)
    expect(arr[1].x).toBe(2)
    expect(out[1].x).toBe(99)
  })

  it('shallow-merges patch into the indexed element', () => {
    const arr = [{ a: 1, b: 2 }, { a: 10, b: 20 }]
    const out = replaceAt(arr, 0, { b: 99 })
    expect(out[0]).toEqual({ a: 1, b: 99 })
    expect(out[1]).toEqual({ a: 10, b: 20 })
  })
})

describe('getLockedSources / getUnlockedSources / getUnlockedSourceIds', () => {
  const list: ISourceConfig[] = [
    src({ source: 'a', locked: true }),
    src({ source: 'b', locked: false }),
    src({ source: 'c' }), // undefined === locked
    src({ source: 'd', locked: false })
  ]

  it('locked treats undefined as locked', () => {
    expect(getLockedSources(list).map(s => s.source)).toEqual(['a', 'c'])
  })

  it('unlocked requires explicit false', () => {
    expect(getUnlockedSources(list).map(s => s.source)).toEqual(['b', 'd'])
  })

  it('getUnlockedSourceIds returns set of ids', () => {
    const ids = getUnlockedSourceIds(list)
    expect(ids.has('b')).toBe(true)
    expect(ids.has('d')).toBe(true)
    expect(ids.has('a')).toBe(false)
    expect(ids.size).toBe(2)
  })

  it('buildUnlockedSourcesMap maps ids to entries', () => {
    const m = buildUnlockedSourcesMap(list)
    expect(m.get('b')?.source).toBe('b')
    expect(m.has('a')).toBe(false)
  })
})

describe('excludeSourcesByIds', () => {
  it('drops sources with matching ids', () => {
    const list = [src({ source: 'a' }), src({ source: 'b' }), src({ source: 'c' })]
    const out = excludeSourcesByIds(list, new Set(['b']))
    expect(out.map(s => s.source)).toEqual(['a', 'c'])
  })

  it('treats missing source id as empty string', () => {
    const list = [src({ source: undefined }), src({ source: 'a' })]
    const out = excludeSourcesByIds(list, new Set(['']))
    expect(out.map(s => s.source)).toEqual(['a'])
  })
})

describe('serializeLockedForDiff', () => {
  it('excludes unlocked sources', () => {
    const list = [src({ source: 'a', locked: true }), src({ source: 'b', locked: false })]
    const json = serializeLockedForDiff(list)
    expect(json).toContain('"source":"a"')
    expect(json).not.toContain('"source":"b"')
  })

  it('strips user-controlled properties', () => {
    const list = [src({ source: 'a', mapType: MapType.Indoor, rulesFileUrl: 'rules.json', locked: true })]
    const json = serializeLockedForDiff(list)
    expect(json).not.toContain('mapType')
    expect(json).not.toContain('rulesFileUrl')
    expect(json).not.toContain('"locked"')
  })

  it('includes only fromMap filters and uses mapExpression for diff', () => {
    const list = [src({
      source: 'a',
      locked: true,
      filters: [
        mapFilter({ expression: 'edited', mapExpression: 'orig', fromMap: true }),
        { expression: 'user', filterType: FilterType.Where, fromMap: false } as IFilterConfig
      ]
    })]
    const json = serializeLockedForDiff(list)
    expect(json).toContain('"expression":"orig"')
    expect(json).not.toContain('"expression":"edited"')
    expect(json).not.toContain('"expression":"user"')
  })

  it('asymmetric excludeSourceIds removes matching sources', () => {
    const list = [src({ source: 'a', locked: true }), src({ source: 'b', locked: true })]
    const fullJson = serializeLockedForDiff(list)
    const filteredJson = serializeLockedForDiff(list, new Set(['b']))
    expect(fullJson).toContain('"source":"b"')
    expect(filteredJson).not.toContain('"source":"b"')
  })

  it('handles undefined input', () => {
    expect(serializeLockedForDiff(undefined)).toBe('[]')
  })
})

describe('stripUserControlledProperties', () => {
  it('keeps user-immutable identity fields and drops user-editable ones', () => {
    const out = stripUserControlledProperties(src({
      source: 'a',
      name: 'A',
      enabled: true,
      mapType: MapType.Indoor,
      rulesFileUrl: 'r',
      locked: true,
      filtersLocked: true
    }))
    expect(out.source).toBe('a')
    expect(out.name).toBe('A')
    expect(out.enabled).toBe(true)
    expect(out.mapType).toBeUndefined()
    expect(out.rulesFileUrl).toBeUndefined()
    expect(out.locked).toBeUndefined()
  })
})

describe('mergeFilters', () => {
  it('replaces locked filters with fresh map values, keeps unlocked map filters and user filters', () => {
    const current: IFilterConfig[] = [
      mapFilter({ expression: 'old1', mapExpression: 'old1', locked: true }),
      mapFilter({ expression: 'edited', mapExpression: 'orig2', locked: false }),
      { expression: 'user-added', filterType: FilterType.Where, fromMap: false } as IFilterConfig
    ]
    const map: IFilterConfig[] = [
      { expression: 'fresh1', filterType: FilterType.Where } as IFilterConfig
    ]
    const out = mergeFilters(current, map)
    // ordering: locked-fresh, then unlocked-from-map, then user-added
    expect(out.length).toBe(3)
    expect(out[0].expression).toBe('fresh1')
    expect(out[0].locked).toBe(true)
    expect(out[0].fromMap).toBe(true)
    expect(out[0].mapExpression).toBe('fresh1')
    expect(out[1].expression).toBe('edited')
    expect(out[2].expression).toBe('user-added')
  })
})

describe('mergeSourcesPreservingUnlocked', () => {
  it('preserves user-editable mapType / rulesFileUrl / filtersLocked from current config', () => {
    const current = [src({
      source: 'a', mapType: MapType.Indoor, rulesFileUrl: 'r.json', filtersLocked: true
    })]
    const map = [src({ source: 'a', mapType: undefined, rulesFileUrl: undefined })]
    const [merged] = mergeSourcesPreservingUnlocked(current, map)
    expect(merged.mapType).toBe(MapType.Indoor)
    expect(merged.rulesFileUrl).toBe('r.json')
    expect(merged.filtersLocked).toBe(true)
  })

  it('preserves enabled/locked only for unlocked sources', () => {
    const current = [
      src({ source: 'a', enabled: false, locked: false }), // unlocked: keep enabled
      src({ source: 'b', enabled: false, locked: true })   // locked: take from map
    ]
    const map = [
      src({ source: 'a', enabled: true }),
      src({ source: 'b', enabled: true })
    ]
    const merged = mergeSourcesPreservingUnlocked(current, map)
    const ma = merged.find(s => s.source === 'a')
    const mb = merged.find(s => s.source === 'b')
    expect(ma?.enabled).toBe(false) // preserved from unlocked current
    expect(ma?.locked).toBe(false)
    expect(mb?.enabled).toBe(true)  // taken from map
  })

  it('uses only map filters when filtersLocked is true (default)', () => {
    const current = [src({
      source: 'a',
      filtersLocked: true,
      filters: [{ expression: 'user', filterType: FilterType.Where, fromMap: false } as IFilterConfig]
    })]
    const map = [src({
      source: 'a',
      filters: [mapFilter({ expression: 'm1', mapExpression: 'm1' })]
    })]
    const [merged] = mergeSourcesPreservingUnlocked(current, map)
    expect(merged.filters?.length).toBe(1)
    expect(merged.filters?.[0].expression).toBe('m1')
  })

  it('merges filters when filtersLocked is false', () => {
    const current = [src({
      source: 'a',
      filtersLocked: false,
      filters: [{ expression: 'user', filterType: FilterType.Where, fromMap: false } as IFilterConfig]
    })]
    const map = [src({
      source: 'a',
      filters: [mapFilter({ expression: 'm1', mapExpression: 'm1' })]
    })]
    const [merged] = mergeSourcesPreservingUnlocked(current, map)
    // mergeFilters: [locked-map, ...unlocked-map, ...user]
    const exprs = merged.filters?.map(f => f.expression)
    expect(exprs).toContain('m1')
    expect(exprs).toContain('user')
  })
})
