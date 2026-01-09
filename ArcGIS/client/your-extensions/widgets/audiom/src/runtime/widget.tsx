import { DataSourceManager, type AllWidgetProps } from 'jimu-core'
import { AudiomSource, MapType } from '../../../../shared/audiom-client/AudiomSource'
import { defaultBaseUrl, IAudiomConfig } from '../setting/types'
import { audiomConfigToEmbedConfig } from '../utils/maputils'
import { MapViewManager } from 'jimu-arcgis';


const dsManager = DataSourceManager.getInstance();
const allDataSources = dsManager.getDataSources();



const Widget = (props: AllWidgetProps<IAudiomConfig>) => {
  const indoorConfig = audiomConfigToEmbedConfig(props.config);

  const indoorUrl = indoorConfig.toUrl(props.config?.baseUrl || defaultBaseUrl);

  return (
    <div className="jimu-widget">
      <iframe name="audiom" src={indoorUrl} width="100%" height="100%" title="ESRI Map" style={{ border: '0px' }}></iframe>
    </div>
  )
}

export default Widget
