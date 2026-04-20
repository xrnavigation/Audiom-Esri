import { sanitizeConfig } from '../../src/setting/validation/validation'
import { DEFAULT_CONFIG } from '../../src/setting/configs'
import { makeConfig } from '../helpers/configFactories'

describe('sanitizeConfig', () => {
  it('clamps an out-of-range latitude and emits a warning', () => {
    const { config, warnings } = sanitizeConfig(makeConfig({ centerLatitude: 1000 }))
    expect(config.centerLatitude).toBe(90)
    expect(warnings.some(w => /lat/i.test(w))).toBe(true)
  })

  it('clamps an out-of-range longitude and zoom', () => {
    const { config } = sanitizeConfig(makeConfig({ centerLongitude: -999, zoom: 999 }))
    expect(config.centerLongitude).toBe(-180)
    expect(config.zoom).toBe(22)
  })

  it('passes valid values through unchanged with no warnings', () => {
    const { config, warnings } = sanitizeConfig(makeConfig({
      centerLatitude: 45, centerLongitude: 90, zoom: 10, stepSize: 5
    }))
    expect(config.centerLatitude).toBe(45)
    expect(config.centerLongitude).toBe(90)
    expect(config.zoom).toBe(10)
    expect(warnings).toEqual([])
  })

  it('resets a malformed stepSize to the default', () => {
    const { config, warnings } = sanitizeConfig(makeConfig({ stepSize: 'abc' as any }))
    expect(config.stepSize).toBe(DEFAULT_CONFIG.stepSize)
    expect(warnings.some(w => /step/i.test(w))).toBe(true)
  })

  it('resets a malicious baseUrl to the default (security guard)', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<x>', 'file:///etc/passwd', 'JaVaScRiPt:alert(1)']) {
      const { config, warnings } = sanitizeConfig(makeConfig({ baseUrl: bad }))
      expect(config.baseUrl).toBe(DEFAULT_CONFIG.baseUrl)
      expect(warnings.some(w => /url|base/i.test(w))).toBe(true)
    }
  })

  it('keeps a valid https baseUrl', () => {
    const { config, warnings } = sanitizeConfig(makeConfig({ baseUrl: 'https://example.com/embed' }))
    expect(config.baseUrl).toBe('https://example.com/embed')
    expect(warnings.filter(w => /url/i.test(w))).toEqual([])
  })
})
