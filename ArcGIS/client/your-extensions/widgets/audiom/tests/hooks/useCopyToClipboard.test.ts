import { renderHook, act } from '@testing-library/react'
import { useCopyToClipboard } from '../../src/setting/useCopyToClipboard'

describe('useCopyToClipboard', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) }
    })
  })
  afterEach(() => { jest.useRealTimers() })

  it('initially reports copied=false', () => {
    const { result } = renderHook(() => useCopyToClipboard())
    expect(result.current.copied).toBe(false)
  })

  it('writes text and flips copied=true, then resets after the delay', async () => {
    const { result } = renderHook(() => useCopyToClipboard(500))
    await act(async () => {
      await result.current.copyToClipboard('hello')
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello')
    expect(result.current.copied).toBe(true)

    act(() => { jest.advanceTimersByTime(500) })
    expect(result.current.copied).toBe(false)
  })

  it('does not throw when clipboard write rejects', async () => {
    ;(navigator.clipboard.writeText as jest.Mock).mockRejectedValueOnce(new Error('denied'))
    const { result } = renderHook(() => useCopyToClipboard())
    await act(async () => {
      await result.current.copyToClipboard('x')
    })
    expect(result.current.copied).toBe(false)
  })
})
