import { DataSourceManager, type AllWidgetProps } from 'jimu-core'
import { audiomConfigToEmbedConfig } from '../utils/maputils'
import { JimuMapView, JimuMapViewComponent } from 'jimu-arcgis';
import { useState } from 'react';
import { DEFAULT_CONFIG, IAudiomConfig } from '../setting/configs';
import { sanitizeConfig, useLogWarnings as logWarnings } from '../setting/validation';

const dsManager = DataSourceManager.getInstance();
const allDataSources = dsManager.getDataSources();

const Widget = (props: AllWidgetProps<IAudiomConfig>) => {
  const [jimuMapView, setJimuMapView] = useState<JimuMapView>()
  
  // Sanitize config on every render (pure function, always reflects current config)
  const { config: sanitizedConfig, warnings } = sanitizeConfig(props.config)
  
  // Log warnings once per unique set
  logWarnings(warnings)
  
  const activeViewChangeHandler = (jmv: JimuMapView) => {
      if (jmv) {
        setJimuMapView(jmv)
      }
    }

  const indoorConfig = audiomConfigToEmbedConfig(sanitizedConfig as IAudiomConfig, jimuMapView);

  const indoorUrl = indoorConfig.toUrl(sanitizedConfig?.baseUrl || DEFAULT_CONFIG.baseUrl);

  return (
    <div className="jimu-widget">
      {props.useMapWidgetIds && props.useMapWidgetIds.length === 1 && (
            <JimuMapViewComponent useMapWidgetId={props.useMapWidgetIds?.[0]} onActiveViewChange={activeViewChangeHandler} />
          )}
      <iframe name="audiom" src={indoorUrl} width="100%" height="100%" title="ESRI Map" style={{ border: '0px' }}></iframe>
    </div>
  )
}

export default Widget
