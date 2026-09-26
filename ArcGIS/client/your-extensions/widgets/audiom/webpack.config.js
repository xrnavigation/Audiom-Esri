/**
 * Experience Builder loads this file when the widget is built.
 * hls.js is an optional cacophony import. HLS playback is unsupported in the
 * widget, so the module is externalized and never bundled.
 */
const path = require('path')

module.exports = {
  resolve: {
    alias: {
      'audiom-front-end/runtime/exbEntry': path.resolve(
        __dirname,
        '../../../../../../Audiom-Front-End/src/runtime/exbEntry.ts'
      ),
      '@xrnavigation/audiom-runtime/in-process': path.resolve(
        __dirname,
        '../../shared/audiom-runtime/src/factory.ts'
      ),
      '@xrnavigation/audiom-runtime/contract': path.resolve(
        __dirname,
        '../../shared/audiom-runtime/src/types.ts'
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
