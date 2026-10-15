import { resolveSoundpackFallbackUrl, resolveSoundpackUrl } from '../../src/runtime/soundpackUrl'

describe('soundpack address', () => {
  it('uses the outdoor pack when the config has none', () => {
    expect(resolveSoundpackUrl(undefined, undefined)).toBe('https://audiom.net/audio')
  })

  it('maps a registry name onto the asset host', () => {
    expect(resolveSoundpackUrl('Indoor', 'https://audiom.net/')).toBe('https://audiom.net/indoor')
  })

  it('points the fallback at the sibling default pack, not a nested path', () => {
    expect(resolveSoundpackFallbackUrl(undefined, 'http://localhost:3002')).toBe(
      'http://localhost:3002/default'
    )
    expect(resolveSoundpackFallbackUrl('Indoor', 'https://audiom.net/')).toBe(
      'https://audiom.net/default'
    )
  })

  it('omits the fallback when the selected pack is already the default pack', () => {
    expect(resolveSoundpackFallbackUrl('Minimal', 'http://localhost:3002')).toBeUndefined()
  })

  it('keeps a full address and does not prefix the asset host', () => {
    expect(resolveSoundpackUrl('https://example.test/packs/custom/', 'https://audiom.net')).toBe(
      'https://example.test/packs/custom'
    )
  })
})
