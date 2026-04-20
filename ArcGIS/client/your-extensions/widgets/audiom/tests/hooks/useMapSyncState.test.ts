import { renderHook, act } from '@testing-library/react'
import { useMapSyncState } from '../../src/setting/hooks/useMapSyncState'
import { LockableFieldName } from '../../src/setting/configKeys'
import { makeImmutableConfig } from '../helpers/configFactories'
import type { IAudiomConfig } from '../../src/setting/configs'

function setup(initialConfig: IAudiomConfig) {
  const onSettingChange = jest.fn<void, [IAudiomConfig]>()
  const { result, rerender } = renderHook(
    ({ config }: { config: IAudiomConfig }) => useMapSyncState(config, onSettingChange),
    { initialProps: { config: initialConfig } }
  )
  return { result, rerender, onSettingChange }
}

describe('useMapSyncState', () => {
  describe('isFieldLocked', () => {
    it('returns the explicit locked flag from config', () => {
      const { result } = setup(makeImmutableConfig({ titleLocked: false }))
      expect(result.current.isFieldLocked(LockableFieldName.Title)).toBe(false)
    })

    it('falls back to LOCKABLE_FIELDS default when undefined', () => {
      // titleLocked default is true
      const { result } = setup(makeImmutableConfig({ titleLocked: undefined }))
      expect(result.current.isFieldLocked(LockableFieldName.Title)).toBe(true)
    })
  })

  describe('fieldNeedsUpdate', () => {
    it('is false when the field is unlocked', () => {
      const { result } = setup(makeImmutableConfig({ zoom: 5, zoomLocked: false }))
      expect(result.current.fieldNeedsUpdate(LockableFieldName.Zoom, 9)).toBe(false)
    })

    it('is true when locked and map value differs', () => {
      const { result } = setup(makeImmutableConfig({ zoom: 5, zoomLocked: true }))
      expect(result.current.fieldNeedsUpdate(LockableFieldName.Zoom, 9)).toBe(true)
    })

    it('is false when locked and map value matches', () => {
      const { result } = setup(makeImmutableConfig({ zoom: 5, zoomLocked: true }))
      expect(result.current.fieldNeedsUpdate(LockableFieldName.Zoom, 5)).toBe(false)
    })
  })

  describe('createLockToggleHandler', () => {
    it('toggles the locked flag on the config and emits via onSettingChange', () => {
      const { result, onSettingChange } = setup(
        makeImmutableConfig({ centerLatitude: 10, centerLatitudeLocked: false })
      )
      const toggle = result.current.createLockToggleHandler(LockableFieldName.CenterLatitude)
      act(() => { toggle() })
      expect(onSettingChange).toHaveBeenCalledTimes(1)
      const [updated] = onSettingChange.mock.calls[0]
      expect((updated as any).centerLatitudeLocked).toBe(true)
    })

    it('on relock, snaps the field back to the most recent map value', () => {
      const { result, onSettingChange } = setup(
        makeImmutableConfig({ zoom: 5, zoomLocked: false })
      )
      // Pretend the map reported zoom=12
      act(() => {
        result.current.updateMapValues({ zoom: 12 })
      })
      const toggle = result.current.createLockToggleHandler(LockableFieldName.Zoom)
      act(() => { toggle() })
      const [updated] = onSettingChange.mock.calls[0]
      expect((updated as any).zoomLocked).toBe(true)
      expect((updated as any).zoom).toBe(12)
    })
  })

  describe('syncLockedFieldsToConfig', () => {
    it('writes only locked fields, leaves unlocked fields untouched', () => {
      const initial = makeImmutableConfig({
        title: 'orig',
        titleLocked: true,
        zoom: 5,
        zoomLocked: false,
        centerLatitude: 10,
        centerLatitudeLocked: true,
        centerLongitude: 20,
        centerLongitudeLocked: true
      })
      const { result } = setup(initial)
      const synced = result.current.syncLockedFieldsToConfig(initial, {
        title: 'fromMap',
        zoom: 99,
        centerLatitude: 11,
        centerLongitude: 22
      })
      expect((synced as any).title).toBe('fromMap')
      expect((synced as any).zoom).toBe(5)            // unlocked: untouched
      expect((synced as any).centerLatitude).toBe(11)
      expect((synced as any).centerLongitude).toBe(22)
    })
  })
})
