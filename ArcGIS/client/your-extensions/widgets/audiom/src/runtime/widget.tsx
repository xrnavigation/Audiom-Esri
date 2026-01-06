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

  // Add sources based on configuration
//   if (config.sourceUrl) {
//     sources.push(
//       AudiomSource.fromEsri({
//         source: 'custom',
//         url: config.sourceUrl,
//         name: config.title || 'Custom Source',
//         mapType: MapType.Indoor,
//         rules: config.rulesFileUrl || '/rules/esri-indoor.json'
//       })
//     );
//   }

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

  const [jimuMapView, setJimuMapView] = useState<JimuMapView>()
  const layersAdded = useRef(false)

  const indoorConfig = toEmbedConfig(props.config);
  let sources: AudiomSource[] = [];
  if (props.config?.sourceUrl) {
    const source = AudiomSource.fromEsri({
        name: 'Units',
        source: 'units',
        url: props.config.sourceUrl,
        mapType: MapType.Indoor,
        rules: props.config?.rulesFileUrl || ''
      });
    sources.push(source);
  }
  // sources.push(AudiomSource.fromEsri({
  //   source: 'levels',
  //   url: 'https://services7.arcgis.com/HDgMIJDCbHtnomY9/ArcGIS/rest/services/ArcGIS_Indoors_Sample_Data_WFL1/FeatureServer/2',
  //   name: 'Levels',
  //   mapType: MapType.Indoor,
  //   rules: '/rules/esri-indoor.json'
  // }));
  indoorConfig.sources = sources;
  // Create config inside component to use props

  // const indoorConfig = AudiomEmbedConfig.dynamic({
  //   apiKey: props.config.apiKey,
  //   sources: [
  //     AudiomSource.fromEsri({
  //       source: 'units',
  //       url: 'https://services7.arcgis.com/HDgMIJDCbHtnomY9/ArcGIS/rest/services/ArcGIS_Indoors_Sample_Data_WFL1/FeatureServer/1',
  //       name: 'Units',
  //       mapType: MapType.Indoor,
  //       rules: '/rules/esri-indoor.json'
  //     }),
  //     AudiomSource.fromEsri({
  //       source: 'levels',
  //       url: 'https://services7.arcgis.com/HDgMIJDCbHtnomY9/ArcGIS/rest/services/ArcGIS_Indoors_Sample_Data_WFL1/FeatureServer/2',
  //       name: 'Levels',
  //       mapType: MapType.Indoor,
  //       rules: '/rules/esri-indoor.json'
  //     })
  //   ],
  //   center: [-117.1945001420124, 34.05679755835778],
  //   showVisualMap: props.config?.showVisualMap ?? true,
  //   showHeading: props.config?.showHeading ?? false,
  //   zoom: props.config?.zoom ?? 19,
  // });

  const indoorUrl = indoorConfig.toUrl(props.config?.baseUrl || 'https://audiom-staging.herokuapp.com');

  // Create feature layers split by level using VERTICAL_ORDER
  const levels = [1, 2, 3];

  const levelIdMap: Record<number, string> = {
    1: 'BAE9BBC5-D74F-4B7A-9904-9763AE70CCF2',
    2: '6EA20B7B-4EFD-4B2C-993F-47E12AE0C776',
    3: '6DE9F705-DA11-4195-84DB-3AB0089D7992'
  };

  const indoorConfigFeatureLayers = levels.flatMap(level => {
    return indoorConfig.sources
      .filter(source => source.name === 'Units')
      .map(source => {
      let definitionExpression = '';
      if (source.name === 'Units') {
        // Units uses LEVEL_ID which references the Levels layer's LEVEL_ID field
        // Use a subquery to get the LEVEL_ID where LEVEL_NUMBER equals the level

        const levelId = levelIdMap[level];

        //definitionExpression = `LEVEL_ID IN (SELECT LEVEL_ID FROM ArcGIS_Indoors_Sample_Data_WFL1 WHERE LEVEL_NUMBER = ${level})`;
        definitionExpression = `LEVEL_ID = '{${levelId}}'`;
      } else if (source.name === 'Levels') {
        // Levels uses LEVEL_NUMBER directly
        definitionExpression = `LEVEL_NUMBER = ${level}`;
      }
      
      return new FeatureLayer({ 
        url: source.url,
        title: `Level ${level}`,
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
      <iframe name="audiom" src={indoorUrl} width="100%" height="100%" title="ESRI Map" style={{ border: '0px' }}></iframe>
    </div>
  )
}

export default Widget
