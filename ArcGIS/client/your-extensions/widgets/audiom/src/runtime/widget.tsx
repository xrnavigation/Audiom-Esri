import { DataSourceManager, type AllWidgetProps } from 'jimu-core'
import { AudiomSource, MapType } from '../../../../shared/audiom-client/AudiomSource'
import { defaultBaseUrl, IAudiomConfig } from '../setting/types'
import { audiomConfigToEmbedConfig } from '../utils/maputils'
import { JimuMapView, JimuMapViewComponent, MapViewManager } from 'jimu-arcgis';
import { useState } from 'react';

const dsManager = DataSourceManager.getInstance();
const allDataSources = dsManager.getDataSources();

const Widget = (props: AllWidgetProps<IAudiomConfig>) => {
  const [jimuMapView, setJimuMapView] = useState<JimuMapView>()
  const activeViewChangeHandler = (jmv: JimuMapView) => {
      if (jmv) {
        setJimuMapView(jmv)
      }
    }

  const indoorConfig = audiomConfigToEmbedConfig(props.config, jimuMapView);

  const indoorUrl = indoorConfig.toUrl(props.config?.baseUrl || defaultBaseUrl);

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
