import { DataSourceManager, React, type AllWidgetProps } from 'jimu-core'
import type { IMConfig } from '../config'

import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis'
import { AudiomEmbedConfig } from '../../../../shared/audiom-client/AudiomEmbedConfig'
import { AudiomSource, MapType } from '../../../../shared/audiom-client/AudiomSource'
import FeatureLayer from 'esri/layers/FeatureLayer'
const { useState, useRef } = React


const dsManager = DataSourceManager.getInstance();
const allDataSources = dsManager.getDataSources();

Object.entries(allDataSources).forEach(([id, ds]) => {
  console.log('DataSource ID:', id);
  console.log('DataSource Type:', ds.type);
});

const indoorConfig = AudiomEmbedConfig.dynamic({
  apiKey: 'wO35blaGsjJREGuXehqWU',
  sources: [
    AudiomSource.fromEsri({
      source: 'census',
      url: "https://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/ACS_Population_by_Race_and_Hispanic_Origin_Boundaries/FeatureServer/2&census.where=State='Hawaii'",
      name: 'Census',
      mapType: MapType.Heatmap,
      rules: '/rules/census.json'
    })
  ],
  center: [-159.48414838102337, 22.151119308677917],
  zoom: 9.5,
});

const indoorUrl = indoorConfig.toUrl('https://audiom-staging.herokuapp.com');

// Create feature layers split by level using VERTICAL_ORDER
const levels = [1, 2, 3];

const levelIdMap: Record<number, string> = {
  1: 'BAE9BBC5-D74F-4B7A-9904-9763AE70CCF2',
  2: '6EA20B7B-4EFD-4B2C-993F-47E12AE0C776',
  3: '6DE9F705-DA11-4195-84DB-3AB0089D7992'
};

const indoorConfigFeatureLayers = levels.flatMap(level => {
  return indoorConfig.sources
    .map(source => {
    let definitionExpression = '';
    
    return new FeatureLayer({ 
      url: source.url,
      title: `Census ${level}`,
      popupEnabled: true,
      opacity: 0.8,
      definitionExpression: definitionExpression,
      visible: level === 1 // Only show Level 1 by default
    });
  });
});

// // Create feature layers with enhanced indoor-specific settings
// const indoorConfigFeatureLayers = indoorConfig.sources.map(source => 
//   new FeatureLayer({ 
//     url: source.url,
//     title: source.name,
//     // Enable popups to show feature info
//     popupEnabled: true,
//     // Set opacity for better visibility
//     opacity: 0.8,
//     // Custom renderer could be added here for indoor-specific styling
//     // renderer: customIndoorRenderer
//   })
// );

const Widget = (props: AllWidgetProps<IMConfig>) => {

  const [jimuMapView, setJimuMapView] = useState<JimuMapView>()
  const layersAdded = useRef(false)

  const activeViewChangeHandler = (jmv: JimuMapView) => {
    if (jmv && !layersAdded.current) {
      setJimuMapView(jmv)
      
      // Add layers in order
      indoorConfigFeatureLayers.forEach(featureLayer => {
        jmv.view.map.add(featureLayer)
      })
      
      layersAdded.current = true
    }
  }

  return (
    <div className="jimu-widget">
      {props.useMapWidgetIds && props.useMapWidgetIds.length === 1 && (
        <JimuMapViewComponent useMapWidgetId={props.useMapWidgetIds?.[0]} onActiveViewChange={activeViewChangeHandler} />
      )}
      <iframe name="Test" src={indoorUrl} width="100%" height="100%" title="test" style={{ border: '0px' }}></iframe>
    </div>
  )
}

export default Widget
