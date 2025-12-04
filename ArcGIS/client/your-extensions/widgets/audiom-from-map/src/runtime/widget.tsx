import { DataSourceManager, React, type AllWidgetProps } from 'jimu-core'
import type { IMConfig } from '../config'

import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis'
import { AudiomEmbedConfig } from '../../../../shared/audiom-client/AudiomEmbedConfig'
import { AudiomSource, MapType } from '../../../../shared/audiom-client/AudiomSource'
import MapImageLayer from 'esri/layers/MapImageLayer'
import { LayerTypes } from '../../../../shared/constants/LayerTypes'
import { StepSize } from '../../../../shared/audiom-client/StepSize'
import FeatureLayer from 'esri/layers/FeatureLayer'
const { useState } = React


const dsManager = DataSourceManager.getInstance();
const allDataSources = dsManager.getDataSources();

Object.entries(allDataSources).forEach(([id, ds]) => {
  console.log('DataSource ID:', id);
  console.log('DataSource Type:', ds.type);
});

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const [jimuMapView, setJimuMapView] = useState<JimuMapView>()
  const [audiomUrl, setAudiomUrl] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const activeViewChangeHandler = (jmv: JimuMapView) => {
    if (jmv) {
      setJimuMapView(jmv)
      extractLayerUrlsAndBuildAudiom(jmv)
    }
  }

  const extractLayerUrlsAndBuildAudiom = async (jmv: JimuMapView) => {
    if (!jmv.view) {
      console.warn('No map view available')
      return
    }

    setLoading(true)
    let audiomSources: AudiomSource[] = []
    const map = jmv.view.map

    // Iterate through all layers in the map
    map.layers.forEach((layer) => {
      console.log(`Processing layer: ${layer.title} (type: ${layer.type})`)
      
      // Handle MapImageLayer with sublayers (e.g., MapServer layers)
      if (layer.type === LayerTypes.FEATURE) {
        const mapImageLayer = layer as FeatureLayer
        console.log(layer);
        if (mapImageLayer.url) {
            const source = AudiomSource.fromEsri({
                  source: `sublayer-${mapImageLayer.layerId}`,
                  url: `${mapImageLayer.url}/${mapImageLayer.layerId}`,
                  name: mapImageLayer.title || `Layer ${mapImageLayer.id}`,
                  mapType: MapType.Indoor,
                  // rules: '/rules/esri-indoor.json'
            });
            audiomSources.push(source)
            console.log(`    Added layer URL to Audiom: ${source.url}`)
        }
      }
    })

    // audiomSources = [
    //   AudiomSource.fromEsri({
    //     source: 'hispanic-population',
    //     url: 'https://services5.arcgis.com/tmfq3OaaehOXO0FN/ArcGIS/rest/services/Tyson661_creditleveragex_com_layers/FeatureServer/10',
    //     name: 'Hispanic Population',
    //     mapType: MapType.Indoor,
    //     //rules: '/rules/esri-indoor.json'
    //   }),
    // ]

    // Build Audiom config with extracted sources
    if (audiomSources.length > 0) {
      try {
        const config = AudiomEmbedConfig.dynamic({
          apiKey: 'wO35blaGsjJREGuXehqWU',
          sources: audiomSources,
          center: [-117.1945001420124, 34.05679755835778],
          showVisualMap: true,
          showHeading: false,
          zoom: 11,
          stepsize: StepSize.Miles(1),
        })
        
        const url = config.toUrl('https://audiom-staging.herokuapp.com')
        setAudiomUrl(url)
        console.log('Audiom URL generated:', url)
      } catch (error) {
        console.error('Error building Audiom config:', error)
      }
    } else {
      console.warn('No layer URLs found in map')
    }
    
    setLoading(false)
  }

  return (
    <div className="jimu-widget" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {props.useMapWidgetIds && props.useMapWidgetIds.length === 1 && (
        <JimuMapViewComponent useMapWidgetId={props.useMapWidgetIds?.[0]} onActiveViewChange={activeViewChangeHandler} />
      )}
      
      {!loading && audiomUrl && (
        <iframe 
          name="AudiomEmbed" 
          src={audiomUrl} 
          width="100%" 
          height="100%" 
          title="Audiom Embed" 
          style={{ border: '0px', flex: 1 }}
        />
      )}
    </div>
  )
}

export default Widget
