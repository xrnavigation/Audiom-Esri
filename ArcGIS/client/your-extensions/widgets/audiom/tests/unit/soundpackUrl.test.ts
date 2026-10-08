import { resolveSoundpackUrl } from '../../src/runtime/soundpackUrl'

describe('soundpack address', () => {
  it('uses the outdoor pack when the config has none', () => {
    expect(resolveSoundpackUrl(undefined, undefined)).toBe('https://audiom.net/audio')
  })

  it('maps a registry name onto the asset host', () => {
    expect(resolveSoundpackUrl('Indoor', 'https://audiom.net/')).toBe('https://audiom.net/indoor')
  })

  it('keeps a full address and does not prefix the asset host', () => {
    expect(resolveSoundpackUrl('https://example.test/packs/custom/', 'https://audiom.net')).toBe(
      'https://example.test/packs/custom'
    )
  })
})
