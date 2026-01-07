import { DataSourceManager, React, type AllWidgetProps } from 'jimu-core'

import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis'
import { AudiomEmbedConfig } from '../../../../shared/audiom-client/AudiomEmbedConfig'
import { AudiomSource, MapType } from '../../../../shared/audiom-client/AudiomSource'
import FeatureLayer from 'esri/layers/FeatureLayer'
import { IAudiomConfig } from '../setting/types'
import { StepSize } from '../../../../shared/audiom-client/StepSize'
const { useState, useRef } = React


const dsManager = DataSourceManager.getInstance();
const allDataSources = dsManager.getDataSources();

Object.entries(allDataSources).forEach(([id, ds]) => {
  console.log('DataSource ID:', id);
  console.log('DataSource Type:', ds.type);
});

export function toEmbedConfig(config: IAudiomConfig): AudiomEmbedConfig {
  const sources: AudiomSource[] = [];

  return AudiomEmbedConfig.dynamic({
    apiKey: config.apiKey || '',
    sources: sources,
    center: [config.centerLongitude || 0, config.centerLatitude || 0],
    showVisualMap: config.showVisualMap ?? true,
    showHeading: config.showHeading ?? false,
    zoom: config.zoom ?? 10,
    heading: config.heading,
    stepSize: StepSize.Kilometers(config.stepSize ?? 1),
  });
}

const Widget = (props: AllWidgetProps<IAudiomConfig>) => {

  const indoorConfig = toEmbedConfig(props.config);
  const sourceConfig = props.config?.sourceConfig;

  let sources: AudiomSource[] = [];
  if (sourceConfig?.sourceUrl) {
    const source = AudiomSource.fromEsri({
        name: sourceConfig.name,
        source: sourceConfig.source,
        url: sourceConfig.sourceUrl,
        mapType: sourceConfig.mapType || MapType.Indoor,
        rules: sourceConfig.rulesFileUrl || ''
      });
    sources.push(source);
  }

  indoorConfig.sources = sources;

  const indoorUrl = indoorConfig.toUrl(props.config?.baseUrl || 'https://audiom-staging.herokuapp.com');

  return (
    <div className="jimu-widget">
      <iframe name="audiom" src={indoorUrl} width="100%" height="100%" title="ESRI Map" style={{ border: '0px' }}></iframe>
    </div>
  )
}

export default Widget
