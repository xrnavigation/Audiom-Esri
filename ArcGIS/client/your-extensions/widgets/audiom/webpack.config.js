/**
 * Experience Builder loads this file when the widget is built.
 * hls.js is an optional cacophony import. HLS playback is unsupported in the
 * widget, so the module is externalized and never bundled.
 */
module.exports = {
  externals: [
    function (context, request, callback) {
      if (request === 'hls.js') {
        return callback(null, 'commonjs ' + request)
      }
      callback()
    }
  ]
}
