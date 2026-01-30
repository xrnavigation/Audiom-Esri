import { React } from 'jimu-core'
import { MapSyncConfig } from '../../utils/mapSyncManager'
import { IAudiomConfig } from '../configs'
import { AudiomConfigKey, LockableFieldName } from '../configKeys'

const { useState, useCallback } = React

/**
 * Configuration for a lockable field
 */
export interface LockableFieldConfig {
  /** The config key for the value */
  valueKey: AudiomConfigKey
  /** The config key for the locked state */
  lockedKey: AudiomConfigKey
  /** Default locked state */
  defaultLocked: boolean
  /** Default value */
  defaultValue: string | number
}

/**
 * Map of lockable field configurations
 */
export const LOCKABLE_FIELDS: Record<LockableFieldName, LockableFieldConfig> = {
  [LockableFieldName.Title]: {
    valueKey: AudiomConfigKey.Title,
    lockedKey: AudiomConfigKey.TitleLocked,
    defaultLocked: true,
    defaultValue: ''
  },
  [LockableFieldName.CenterLatitude]: {
    valueKey: AudiomConfigKey.CenterLatitude,
    lockedKey: AudiomConfigKey.CenterLatitudeLocked,
    defaultLocked: true,
    defaultValue: 0
  },
  [LockableFieldName.CenterLongitude]: {
    valueKey: AudiomConfigKey.CenterLongitude,
    lockedKey: AudiomConfigKey.CenterLongitudeLocked,
    defaultLocked: true,
    defaultValue: 0
  },
  [LockableFieldName.Zoom]: {
    valueKey: AudiomConfigKey.Zoom,
    lockedKey: AudiomConfigKey.ZoomLocked,
    defaultLocked: true,
    defaultValue: 10
  }
}

/**
 * State for map sync values (values from the ESRI map)
 * Keys correspond to LockableFieldName enum values
 */
export interface MapSyncState {
  [LockableFieldName.Title]?: string
  [LockableFieldName.CenterLatitude]?: number
  [LockableFieldName.CenterLongitude]?: number
  [LockableFieldName.Zoom]?: number
}

/**
 * Hook for managing lockable field state and syncing with map values.
 * Consolidates the map sync state and provides a generic lock toggle handler.
 */
export function useMapSyncState(
  config: IAudiomConfig,
  onSettingChange: (config: IAudiomConfig) => void
) {
  // Consolidated state for map values
  const [mapValues, setMapValues] = useState<MapSyncState>({})

  /**
   * Update map values from a MapSyncConfig
   */
  const updateMapValues = useCallback((newMapConfig: MapSyncConfig) => {
    setMapValues({
      [LockableFieldName.Title]: newMapConfig.title,
      [LockableFieldName.CenterLatitude]: newMapConfig.centerLatitude,
      [LockableFieldName.CenterLongitude]: newMapConfig.centerLongitude,
      [LockableFieldName.Zoom]: newMapConfig.zoom
    })
  }, [])

  /**
   * Get whether a field is locked
   */
  const isFieldLocked = useCallback((fieldName: LockableFieldName): boolean => {
    const fieldConfig = LOCKABLE_FIELDS[fieldName]
    return config?.[fieldConfig.lockedKey as keyof IAudiomConfig] as boolean ?? fieldConfig.defaultLocked
  }, [config])

  /**
   * Get the current value of a lockable field
   */
  const getFieldValue = useCallback((fieldName: LockableFieldName): string | number => {
    const fieldConfig = LOCKABLE_FIELDS[fieldName]
    return config?.[fieldConfig.valueKey as keyof IAudiomConfig] as string | number ?? fieldConfig.defaultValue
  }, [config])

  /**
   * Get the map value for a lockable field
   */
  const getMapValue = useCallback((fieldName: LockableFieldName): string | number | undefined => {
    return mapValues[fieldName]
  }, [mapValues])

  /**
   * Generic lock toggle handler for any lockable field
   */
  const createLockToggleHandler = useCallback((fieldName: LockableFieldName) => {
    return () => {
      const fieldConfig = LOCKABLE_FIELDS[fieldName]
      const currentLocked = isFieldLocked(fieldName)
      let newConfig = config.set(fieldConfig.lockedKey as keyof IAudiomConfig, !currentLocked)

      // If relocking, reset to map value
      if (!currentLocked) {
        const mapValue = getMapValue(fieldName)
        if (mapValue !== undefined) {
          newConfig = newConfig.set(fieldConfig.valueKey as keyof IAudiomConfig, mapValue as any)
        }
      }

      onSettingChange(newConfig)
    }
  }, [config, isFieldLocked, getMapValue, onSettingChange])

  /**
   * Check if a field needs to be updated based on lock state and map value
   */
  const fieldNeedsUpdate = useCallback((
    fieldName: LockableFieldName,
    mapValue: string | number | undefined
  ): boolean => {
    if (!isFieldLocked(fieldName)) return false
    const currentValue = getFieldValue(fieldName)
    return currentValue !== mapValue
  }, [isFieldLocked, getFieldValue])

  return {
    mapValues,
    updateMapValues,
    isFieldLocked,
    getFieldValue,
    getMapValue,
    createLockToggleHandler,
    fieldNeedsUpdate
  }
}
