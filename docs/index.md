# 🗺️ Audiom Maps - ESRI Experience Builder

<video src="./Audiom - Widget Demo.mp4" width="900" controls></video>

This page provides a list of different maps made using the Audiom widget for ESRI Experience Builder.

- [Map of the ESRI Building](./samples/esri-building/)
- [Census of Hawaii](./samples/census/)


## 📦 Installing the Audiom Widget

### 🌐 For ArcGIS Enterprise Users

You must register each custom widget in your portal. Portal administrator privileges are required to register a custom widget.

1. In a browser window, sign in to your ArcGIS Enterprise portal.
2. Click the **My Content** tab of the content page.
3. Click **Add Item** and choose *An application.*
4. Choose *Experience Builder widget,* and provide the URL to your manifest file.
5. [The Audiom manifest file is located here.](./audiom/manifest.json)
6. Click the *Title box.*
7. The title of the item automatically populates from the manifest file. Optionally, you can manually edit the title.
8. Add tags in the *Tags box.*
9. Click **Add Item.**
10. The custom widget is now available on the My Content tab of the content page as an Experience Builder widget type.

[These instructions on the official ESRI Website can be found here.](https://developers.arcgis.com/documentation/app-builders/low-code/arcgis-experience-builder/custom-widgets-in-arcgis-enterprise/)


### 🖥️ For ArcGIS Developer Edition Users

1. [Download the Zip file containing the Audiom Widget.](./audiom.zip)
2. Extract the Widget contents to `<ArcGIS Developer Edition>/client/your-extensions/widgets/`


## 🔧 Embedding Audiom Using the Embed Widget

For those using ArcGIS Online or those without the ability to use custom widgets, the built-in [Embed Widget](https://doc.arcgis.com/en/experience-builder/latest/configure-widgets/embed-widget.htm) can be used instead.

[Click here for an example of a map making use of the built-in embed widget.](./samples/embed/)

1. Follow the [Audiom Embedding Instructions](./embedding.md) to generate `<iframe>` embedding code for your desired Audiom map.
2. The embed code should look something like the following:

    ````html
    <iframe name="audiom" src="https://audiom-staging.herokuapp.com/embed/dynamic?apiKey=<your_api_key>&sources=census&census.type=esri&census.mapType=heatmap&census.name=Census&census.url=https://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/ACS_Population_by_Race_and_Hispanic_Origin_Boundaries/FeatureServer/2&census.where=State=%27Hawaii%27&census.rules=/rules/census.json&center=-159.48414838102337,22.151119308677917&zoom=9.5" width="100%" height="100%" title="Hawaii Census" style="border: 0px;"></iframe>
    ````

3. Set the embed style to `Code` and paste the `<iframe>` code directly into the text box.
4. To ensure that your map has an accessible title, click the `A11Y` button in the bottom-right hand side of the experience builder and toggle on: `Enable accessibility settings for each widget`
5. Set an accessible title for the map in the widget settings under: `Accessibility settings->Accessible label`