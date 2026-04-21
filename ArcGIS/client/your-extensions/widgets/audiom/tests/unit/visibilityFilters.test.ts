import { computeVisibilityFilters } from '../../src/utils/visibilityFilters'
import { ISourceConfig } from '../../src/setting/configs'

describe('computeVisibilityFilters', () => {
  it('returns empty global and scan for empty/undefined input', () => {
    expect(computeVisibilityFilters(undefined)).toEqual({ global: [], scan: [] })
    expect(computeVisibilityFilters([])).toEqual({ global: [], scan: [] })
  })

  it('includes locked + enabled sources, using `source` slug', () => {
    const sources: ISourceConfig[] = [
      { source: 'parks', name: 'Parks', locked: true, enabled: true },
      { source: 'roads', name: 'Roads', locked: true, enabled: true }
    ]
    expect(computeVisibilityFilters(sources)).toEqual({
      global: ['parks', 'roads'],
      scan: ['parks', 'roads']
    })
  })

  it('treats `enabled === undefined` as enabled (default visible)', () => {
    const sources: ISourceConfig[] = [
      { source: 'parks', locked: true } // no `enabled` field
    ]
    expect(computeVisibilityFilters(sources).global).toEqual(['parks'])
  })

  it('excludes disabled sources', () => {
    const sources: ISourceConfig[] = [
      { source: 'parks', locked: true, enabled: true },
      { source: 'roads', locked: true, enabled: false }
    ]
    expect(computeVisibilityFilters(sources).global).toEqual(['parks'])
  })

  it('excludes unlocked sources (user-controlled, do not auto-sync)', () => {
    const sources: ISourceConfig[] = [
      { source: 'parks', locked: true, enabled: true },
      { source: 'roads', locked: false, enabled: true }
    ]
    expect(computeVisibilityFilters(sources).global).toEqual(['parks'])
  })

  it('falls back to `name` when `source` is missing', () => {
    const sources: ISourceConfig[] = [
      { name: 'Parks', locked: true, enabled: true }
    ]
    expect(computeVisibilityFilters(sources).global).toEqual(['Parks'])
  })

  it('omits sources with neither `source` nor `name`', () => {
    const sources: ISourceConfig[] = [
      { locked: true, enabled: true } as ISourceConfig,
      { source: 'parks', locked: true, enabled: true }
    ]
    expect(computeVisibilityFilters(sources).global).toEqual(['parks'])
  })

  it('produces identical `global` and `scan` arrays', () => {
    const sources: ISourceConfig[] = [
      { source: 'a', locked: true, enabled: true },
      { source: 'b', locked: true, enabled: true }
    ]
    const out = computeVisibilityFilters(sources)
    expect(out.global).toEqual(out.scan)
  })
})
