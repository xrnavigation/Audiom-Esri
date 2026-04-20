import { JimuConfig } from '../../src/utils/JimuConfig'

describe('JimuConfig', () => {
  // The class is a singleton that snapshots window.jimuConfig on first call.
  // Each test must reset both the singleton and window.jimuConfig to avoid
  // test pollution.
  beforeEach(() => {
    ;(JimuConfig as any).instance = null
  })

  function setJimuConfig(partial: Record<string, any>) {
    ;(window as any).jimuConfig = { ...(window as any).jimuConfig, ...partial }
  }

  it('returns the same singleton instance across calls', () => {
    const a = JimuConfig.getInstance()
    const b = JimuConfig.getInstance()
    expect(a).toBe(b)
  })

  it('isInBuilder reads window.jimuConfig.isInBuilder', () => {
    setJimuConfig({ isInBuilder: true })
    expect(JimuConfig.getInstance().isInBuilder()).toBe(true)

    ;(JimuConfig as any).instance = null
    setJimuConfig({ isInBuilder: false })
    expect(JimuConfig.getInstance().isInBuilder()).toBe(false)
  })

  it('isInRuntime is the inverse of isInBuilder', () => {
    setJimuConfig({ isInBuilder: false })
    expect(JimuConfig.getInstance().isInRuntime()).toBe(true)
  })

  it('isInPortal / isSite / isDevEdition reflect their flags', () => {
    setJimuConfig({ isInPortal: true, isSite: false, isDevEdition: true })
    const cfg = JimuConfig.getInstance()
    expect(cfg.isInPortal()).toBe(true)
    expect(cfg.isSite()).toBe(false)
    expect(cfg.isDevEdition()).toBe(true)
  })

  it('getConfig returns the underlying jimuConfig', () => {
    setJimuConfig({ exbVersion: '1.99.0' })
    expect(JimuConfig.getInstance().getConfig().exbVersion).toBe('1.99.0')
  })
})
