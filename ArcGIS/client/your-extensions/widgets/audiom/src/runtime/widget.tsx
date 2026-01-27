import { DataSourceManager, type AllWidgetProps } from 'jimu-core'
import { audiomConfigToEmbedConfig } from '../utils/maputils'
import { getMapSyncManager, AUTO_SYNC_LAYERS } from '../utils/mapSyncManager'
import { JimuMapView, JimuMapViewComponent } from 'jimu-arcgis'
import { useState, useEffect } from 'react'
import { DEFAULT_CONFIG, IAudiomConfig } from '../setting/configs'
import { sanitizeConfig, useLogWarnings as logWarnings } from '../setting/validation/validation'
import MessagePopup, { MessageType } from './components/MessagePopup'
import { JimuConfig } from '../utils/JimuConfig'

const dsManager = DataSourceManager.getInstance()
const allDataSources = dsManager.getDataSources()

const Widget = (props: AllWidgetProps<IAudiomConfig>) => {
  const [jimuMapView, setJimuMapView] = useState<JimuMapView>()
  const [hasChanges, setHasChanges] = useState(false)
  const [lastSyncedConfigJson, setLastSyncedConfigJson] = useState<string>('')
  const mapSyncManager = getMapSyncManager()
  
  // Sanitize config on every render (pure function, always reflects current config)
  const { config: sanitizedConfig, warnings } = sanitizeConfig(props.config)
  
  // Log warnings once per unique set
  logWarnings(warnings)
  
  const activeViewChangeHandler = (jmv: JimuMapView) => {
    if (jmv) {
      setJimuMapView(jmv)
      // Clear changes indicator when map view is set (widget is being selected/focused)
      setHasChanges(false)
    }
  }

  // Listen for map changes to show the "changes detected" message
  useEffect(() => {
    if (!AUTO_SYNC_LAYERS || !sanitizedConfig?.useExistingMap || !sanitizedConfig?.existingMapId) {
      return
    }

    // Attach to the map and pass current config to detect initial mismatches
    mapSyncManager.attach(sanitizedConfig.existingMapId, sanitizedConfig)

    // Store the initial synced config (only locked sources for comparison)
    const lockedSources = (sanitizedConfig.sourceConfigs || []).filter(s => s.locked !== false)
    const initialJson = JSON.stringify(lockedSources)
    setLastSyncedConfigJson(initialJson)

    // Listen for changes
    const onMapChange = () => {
      // Check if there are actual changes compared to current config
      if (mapSyncManager.hasChanges(sanitizedConfig.existingMapId, sanitizedConfig)) {
        setHasChanges(true)
      }
    }

    mapSyncManager.addChangeListener(onMapChange)

    return () => {
      mapSyncManager.removeChangeListener(onMapChange)
    }
  }, [sanitizedConfig?.useExistingMap, sanitizedConfig?.existingMapId, sanitizedConfig, mapSyncManager])

  // Clear changes indicator when config updates (means settings panel synced)
  // Only compare locked sources - unlocked sources are manually controlled
  useEffect(() => {
    const lockedSources = (sanitizedConfig?.sourceConfigs || []).filter(s => s.locked !== false)
    const currentJson = JSON.stringify(lockedSources)
    if (currentJson !== lastSyncedConfigJson && lastSyncedConfigJson !== '') {
      // Config changed, meaning settings panel likely synced it
      setHasChanges(false)
      setLastSyncedConfigJson(currentJson)
    } else if (lastSyncedConfigJson === '') {
      // Initial load
      setLastSyncedConfigJson(currentJson)
    }
  }, [sanitizedConfig?.sourceConfigs, lastSyncedConfigJson])

  const indoorConfig = audiomConfigToEmbedConfig(sanitizedConfig as IAudiomConfig, jimuMapView)
  const indoorUrl = indoorConfig.toUrl(sanitizedConfig?.baseUrl || DEFAULT_CONFIG.baseUrl)

  return (
    <div className="jimu-widget" style={{ position: 'relative' }}>
      {props.useMapWidgetIds && props.useMapWidgetIds.length === 1 && (
        <JimuMapViewComponent useMapWidgetId={props.useMapWidgetIds?.[0]} onActiveViewChange={activeViewChangeHandler} />
      )}
      <MessagePopup 
        show={hasChanges && JimuConfig.getInstance().isInBuilder()} 
        message="Map changes detected. Select the Audiom widget to re-synchronize."
        variant={MessageType.Warning}
      />
      <iframe name="audiom" src={indoorUrl} width="100%" height="100%" title="ESRI Map" style={{ border: '0px' }}></iframe>
    </div>
  )
}

export default Widget
