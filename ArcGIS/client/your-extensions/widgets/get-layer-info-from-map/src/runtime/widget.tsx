import { React, type AllWidgetProps } from 'jimu-core'
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis'
import FeatureLayer from 'esri/layers/FeatureLayer'
import CSVLayer from 'esri/layers/CSVLayer'
import GeoJSONLayer from 'esri/layers/GeoJSONLayer'
import MapImageLayer from 'esri/layers/MapImageLayer'
import { LayerTypes } from '../../../../shared/constants/LayerTypes'

const { useState } = React

const Widget = (props: AllWidgetProps<any>) => {
  const [jimuMapView, setJimuMapView] = useState<JimuMapView>()
  const [layerUrls, setLayerUrls] = useState<string[]>([])

  const activeViewChangeHandler = (jmv: JimuMapView) => {
    if (jmv) {
      setJimuMapView(jmv)
    }
  }

  const getLayerInfo = async () => {
    if (!jimuMapView || !jimuMapView.view) {
      console.warn('No map view available')
      return
    }

    const urls: string[] = []
    const map = jimuMapView.view.map

    // Iterate through all layers in the map
    map.layers.forEach((layer) => {
      console.log(`Processing layer: ${layer.title} (type: ${layer.type})`)
      
      // Handle different layer types that can have DataFile URLs
      if (layer.type === LayerTypes.FEATURE) {
        const featureLayer = layer as FeatureLayer
        
        // Standard FeatureLayer URL
        if (featureLayer.url) {
          urls.push(featureLayer.url)
          console.log(`Found FeatureLayer URL: ${featureLayer.url}`)
        }
      }
      else if (layer.type === LayerTypes.CSV) {
        const csvLayer = layer as CSVLayer
        
        // CSV layers have a url property that points to the CSV file
        if (csvLayer.url) {
          urls.push(csvLayer.url)
          console.log(`Found CSV layer URL: ${csvLayer.url}`)
        }
      }
      else if (layer.type === LayerTypes.GEOJSON) {
        const geoJsonLayer = layer as GeoJSONLayer
        
        // GeoJSON layers have a url property that points to the GeoJSON file
        if (geoJsonLayer.url) {
          urls.push(geoJsonLayer.url)
          console.log(`Found GeoJSON layer URL: ${geoJsonLayer.url}`)
        }
      }
      
      // Check for MapImageLayer with sublayers (e.g., MapServer layers)
      if (layer.type === LayerTypes.MAP_IMAGE) {
        const mapImageLayer = layer as MapImageLayer
        
        if (mapImageLayer.sublayers) {
          mapImageLayer.sublayers.forEach((sublayer) => {
            console.log(`  Found sublayer: ${sublayer.title} (id: ${sublayer.id})`)
            
            if (sublayer.url) {
              urls.push(sublayer.url)
              console.log(`    Sublayer URL: ${sublayer.url}`)
            }
          })
        }
      }
      
      // Log layer details for debugging
      console.log('Layer details:', {
        title: layer.title,
        type: layer.type,
        id: layer.id,
        visible: layer.visible,
        hasSublayers: 'sublayers' in layer && !!layer.sublayers
      })
    })

    // Remove duplicates
    const uniqueUrls = [...new Set(urls)]
    setLayerUrls(uniqueUrls)
    
    console.log('Extracted URLs:', uniqueUrls)
  }

  return <div className="widget-starter jimu-widget" style={{ padding: '10px' }}>
    {props.useMapWidgetIds && props.useMapWidgetIds.length === 1 && (
      <JimuMapViewComponent useMapWidgetId={props.useMapWidgetIds?.[0]} onActiveViewChange={activeViewChangeHandler} />
    )}

    <div style={{ marginBottom: '10px' }}>
      <button onClick={getLayerInfo} style={{ padding: '8px 16px', cursor: 'pointer' }}>
        Extract Feature Layer URLs
      </button>
    </div>

    {layerUrls.length > 0 && (
      <div>
        <h3>Feature Layer URLs:</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {layerUrls.map((url, index) => (
            <li key={index} style={{ 
              marginBottom: '8px', 
              padding: '8px', 
              backgroundColor: '#f0f0f0', 
              borderRadius: '4px',
              wordBreak: 'break-all'
            }}>
              <strong>URL {index + 1}:</strong><br/>
              <code style={{ fontSize: '12px' }}>{url}</code>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
          Total URLs found: {layerUrls.length}
        </div>
      </div>
    )}

    {jimuMapView && layerUrls.length === 0 && (
      <div style={{ marginTop: '10px', padding: '8px', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
        <p style={{ margin: 0, fontSize: '14px' }}>
          Click "Extract Feature Layer URLs" to get URLs from feature layers in the map.
        </p>
      </div>
    )}

    {!jimuMapView && (
      <div style={{ marginTop: '10px', padding: '8px', backgroundColor: '#f8d7da', borderRadius: '4px' }}>
        <p style={{ margin: 0, fontSize: '14px' }}>
          Please ensure a map widget is configured for this widget to access feature layers.
        </p>
      </div>
    )}
  </div>
}

export default Widget
