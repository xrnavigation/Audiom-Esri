/**
 * Experience Builder does not load this file. The client build uses
 * client/webpack/widget-webpack-override.js, which setup_arcgis.py copies
 * from exb-webpack/. Aliases here only help a host that loads this file
 * directly. hls.js is an optional cacophony import and is never bundled.
 */
const path = require('path')

module.exports = {
  resolve: {
    alias: {
      // The runtime package imports the layerloader entry; only its rules
      // evaluator is needed, and the browser barrel pulls OSM and GTFS.
      '@xrnavigation/layerloader$': path.resolve(__dirname, 'exb-webpack/layerloader-rules.js')
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
