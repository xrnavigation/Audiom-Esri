import { React, type AllWidgetProps } from 'jimu-core'
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis'
import FeatureLayer from 'esri/layers/FeatureLayer'

const { useState } = React

const Widget = (props: AllWidgetProps<any>) => {
  const [jimuMapView, setJimuMapView] = useState<JimuMapView>()

  const activeViewChangeHandler = (jmv: JimuMapView) => {
    if (jmv) {
      setJimuMapView(jmv)
    }
  }

  const formSubmit = (evt) => {
    evt.preventDefault()

    // Create array of FeatureLayers
    const layers = [
      // Trailheads (commented out)
      // new FeatureLayer({
      //   url: 'https://services3.arcgis.com/GVgbJbqm8hXASVYi/arcgis/rest/services/Trailheads_Styled/FeatureServer/0'
      // }),
      
      // ArcGIS Indoors Sample Data
      new FeatureLayer({
        url: 'https://services7.arcgis.com/HDgMIJDCbHtnomY9/ArcGIS/rest/services/ArcGIS_Indoors_Sample_Data_WFL1/FeatureServer/0'
      }),
      new FeatureLayer({
        url: 'https://services7.arcgis.com/HDgMIJDCbHtnomY9/ArcGIS/rest/services/ArcGIS_Indoors_Sample_Data_WFL1/FeatureServer/1'
      }),
      new FeatureLayer({
        url: 'https://services7.arcgis.com/HDgMIJDCbHtnomY9/ArcGIS/rest/services/ArcGIS_Indoors_Sample_Data_WFL1/FeatureServer/2'
      })
    ]

    // Add all layers to the map
    layers.forEach(layer => {
      jimuMapView.view.map.add(layer)
    })
  }

  return <div className="widget-starter jimu-widget">
    {props.useMapWidgetIds && props.useMapWidgetIds.length === 1 && (
      <JimuMapViewComponent useMapWidgetId={props.useMapWidgetIds?.[0]} onActiveViewChange={activeViewChangeHandler} />
    )}

    <form onSubmit={formSubmit}>
      <div>
        <button>Add Layer</button>
      </div>
    </form>
  </div>
}

export default Widget
