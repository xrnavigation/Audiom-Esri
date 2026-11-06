/**
 * Experience Builder does not load this file. The client build uses
 * client/webpack/widget-webpack-override.js, which setup_arcgis.py copies
 * from exb-webpack/. Aliases here only help a host that loads this file
 * directly. hls.js is an optional cacophony import and is never bundled.
 */
const path = require('path')

const frontEndRoot = process.env.AUDIOM_FRONTEND_ROOT
  ? path.resolve(process.env.AUDIOM_FRONTEND_ROOT)
  : path.resolve(__dirname, '../../../../../../Audiom-Front-End')

module.exports = {
  resolve: {
    alias: {
      'audiom-front-end/runtime/exbEntry': path.join(
        frontEndRoot,
        'src/runtime/exbEntry.ts'
      ),
      '@xrnavigation/audiom-runtime/in-process': path.resolve(
        __dirname,
        '../../shared/audiom-runtime/src/factory.ts'
      ),
      '@xrnavigation/audiom-runtime/contract': path.resolve(
        __dirname,
        '../../shared/audiom-runtime/src/types.ts'
      ),
      // The widget evaluates Audiom rules. Point the package at the browser
      // build so Experience Builder does not pull the Node entry.
      '@xrnavigation/layerloader/rules/mapboxRuleProcessor': path.join(
        frontEndRoot,
        'node_modules/@xrnavigation/layerloader/dist/browser/rules/mapboxRuleProcessor.js'
      ),
      '@xrnavigation/layerloader/rules/materializeRuntimeRuleSet': path.join(
        frontEndRoot,
        'node_modules/@xrnavigation/layerloader/dist/browser/rules/materializeRuntimeRuleSet.js'
      ),
      '@mapbox/mapbox-gl-style-spec': path.join(
        frontEndRoot,
        'node_modules/@mapbox/mapbox-gl-style-spec'
      )
    },
    extensions: ['.ts', '.tsx', '.js']
  },
  externals: [
    function (context, request, callback) {
      if (request === 'hls.js' || request === 'maplibre-gl' || request === 'next' || request === 'next/router') {
        return callback(null, 'commonjs ' + request)
      }
      callback()
    }
  ]
}
