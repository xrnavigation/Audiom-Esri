/**
 * Temporary published Experience Builder app for the bundled-widget tests.
 *
 * Live means the runtime window, not the builder Live view button. The
 * published config is apps/<id>/config.json with no __not_publish flag.
 * The fixture matches the local Esri Building app and does not store an API key.
 */
const { mkdirSync, rmSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const https = require('node:https')

const APP_ID = 'e2e-live'
const ORIGIN = process.env.AUDIOM_EXB_ORIGIN || 'https://localhost:3001'
const APPS_DIR = join(__dirname, '../ArcGIS/server/public/apps', APP_ID)
const ESRI_BUILDING_ITEM = '5c51c0d1b66b4c488f3b1a43e0a27a31'
const PORTAL_URL = 'https://xrnavigation.maps.arcgis.com'
const INDOORS = 'https://services7.arcgis.com/HDgMIJDCbHtnomY9/ArcGIS/rest/services/ArcGIS_Indoors_Sample_Data_WFL1/FeatureServer'

function liveConfig () {
  return {
    pages: {
      page_0: {
        id: 'page_0',
        mode: 'FIT_WINDOW',
        type: 'NORMAL',
        layout: { LARGE: 'layout_0' },
        isDefault: true,
        isVisible: true,
        label: 'Page'
      }
    },
    layouts: {
      layout_0: {
        type: 'FIXED',
        content: {
          0: {
            type: 'WIDGET',
            widgetId: 'widget_1',
            bbox: { left: '0%', right: '0%', top: '0%', bottom: '0%', width: '100%', height: '100%' },
            setting: {
              autoProps: { left: false, right: false, top: false, bottom: false, height: 'STRETCH', width: 'STRETCH' },
              vCenter: false,
              hCenter: false
            }
          }
        },
        order: ['0']
      }
    },
    exbVersion: '1.20.0',
    mainSizeMode: 'LARGE',
    theme: 'themes/master/',
    forBuilderAttributes: { lockLayout: false },
    template: 'blankfullscreen',
    widgets: {
      widget_1: {
        uri: 'widgets/audiom/',
        version: '1.20.0',
        label: 'Audiom',
        id: 'widget_1',
        config: {
          existingMapId: 'widget_1',
          runtimeLocation: 'bundled',
          assetBaseUrl: process.env.AUDIOM_ASSET_BASE_URL || 'http://localhost:3002',
          mapItemId: ESRI_BUILDING_ITEM,
          centerLatitude: 34.05669873306259,
          centerLongitude: -117.19468783901752,
          zoom: 18,
          title: 'Esri Building',
          sourceConfigs: [
            { name: 'Sites', source: '19c06d1cbae-layer-3', sourceUrl: INDOORS + '/4', enabled: false, rulesFileUrl: '/rules/esri-indoor.json' },
            { name: 'Facilities', source: '19c06d1cbaf-layer-4', sourceUrl: INDOORS + '/3', enabled: false, rulesFileUrl: '/rules/esri-indoor.json' },
            { name: 'Levels', source: '19c06d1cbaf-layer-5', sourceUrl: INDOORS + '/2', enabled: true, rulesFileUrl: '/rules/esri-indoor.json' },
            { name: 'Units', source: '19c06d1cbaf-layer-6', sourceUrl: INDOORS + '/1', enabled: true, rulesFileUrl: '/rules/esri-indoor.json' },
            { name: 'Details', source: '19c06d1cbb0-layer-7', sourceUrl: INDOORS + '/0', enabled: false, rulesFileUrl: '/rules/esri-indoor.json' }
          ]
        },
        useMapWidgetIds: ['widget_1'],
        useDataSourcesEnabled: true,
        useDataSources: [{ dataSourceId: 'dataSource_1', mainDataSourceId: 'dataSource_1' }]
      }
    },
    widgetsManifest: {},
    views: {},
    sections: {},
    dialogs: {},
    messageConfigs: {},
    attributes: { portalUrl: PORTAL_URL },
    mainLocale: 'en',
    dataSources: {
      dataSource_1: {
        id: 'dataSource_1',
        type: 'WEB_MAP',
        sourceLabel: 'Esri Building',
        itemId: ESRI_BUILDING_ITEM,
        portalUrl: PORTAL_URL
      }
    },
    pageStructure: [{ page_0: [] }]
  }
}

function publishLiveExperience () {
  const body = JSON.stringify(liveConfig(), null, 2)
  if (body.includes('apiKey') || body.includes('__not_publish')) {
    throw new Error('Refusing to publish a fixture that contains an API key or a draft flag')
  }
  rmSync(APPS_DIR, { recursive: true, force: true })
  mkdirSync(join(APPS_DIR, 'resources', 'config'), { recursive: true })
  writeFileSync(join(APPS_DIR, 'config.json'), body)
  writeFileSync(join(APPS_DIR, 'resources', 'config', 'config.json'), body)
  writeFileSync(join(APPS_DIR, 'info.json'), JSON.stringify({
    id: APP_ID,
    title: 'Audiom e2e live',
    name: 'Audiom e2e live',
    type: 'Web Experience',
    isLocalApp: true
  }, null, 2))
  return { appId: APP_ID, url: `${ORIGIN}/experience/${APP_ID}/` }
}

function removeLiveExperience () {
  rmSync(APPS_DIR, { recursive: true, force: true })
}

function getText (url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { rejectUnauthorized: false }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString('utf8') })
      })
    })
    request.on('error', reject)
  })
}

async function assertServerHasLiveConfig () {
  const served = await getText(`${ORIGIN}/apps/${APP_ID}/config.json`)
  if (served.status !== 200) {
    throw new Error(`Experience Builder did not serve the live app (${served.status}). Start the server on ${ORIGIN}.`)
  }
  if (served.text.includes('__not_publish')) throw new Error('The served config is still a draft')
  if (served.text.includes('apiKey')) throw new Error('The served config contains an API key')
}

module.exports = { APP_ID, ORIGIN, publishLiveExperience, removeLiveExperience, assertServerHasLiveConfig }