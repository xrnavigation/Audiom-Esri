/**
 * Audiom webpack overlay for Experience Builder.
 *
 * Edit this file. Do not edit ArcGIS/client/webpack/widget-webpack-override.js.
 * That copy is gitignored and setup_arcgis.py replaces it from here after
 * every Experience Builder extract. Paths below are relative to client/webpack,
 * which is where this file runs.
 *
 * The widget runs the published @xrnavigation/audiom-runtime package, which
 * `npm ci` installs into widgets/audiom/node_modules.
 */
const fs = require('fs')
const path = require('path')
const webpack = require('webpack')

const WIDGET_ROOT = path.resolve(__dirname, '../your-extensions/widgets/audiom')
const widgetModules = path.join(WIDGET_ROOT, 'node_modules')
const hostJsxRuntime = path.join(__dirname, 'host-jsx-runtime.js')
// Resolved beside its source so its own imports find the widget's packages.
const layerloaderRules = path.join(WIDGET_ROOT, 'exb-webpack', 'layerloader-rules.js')
// The widget and everything it installs. Plain CSS in the runtime package is
// already compiled into its modules, so no stylesheet rule is needed here.
const WIDGET_CODE = /widgets[\\/]audiom[\\/].+\.[cm]?[jt]sx?$/

if (!fs.existsSync(path.join(widgetModules, '@xrnavigation', 'audiom-runtime', 'package.json'))) {
  throw new Error(
    'The Audiom runtime package is not installed: ' + widgetModules +
    '. Run npm ci in ArcGIS/client/your-extensions/widgets/audiom.'
  )
}

console.log('Audiom webpack overlay')
console.log('  widget packages:', widgetModules)

/** Alias a package path inside the widget's node_modules, when it is installed. */
function widgetPackage (aliases, request, relative) {
  const target = path.join(widgetModules, relative)
  if (fs.existsSync(target)) aliases[request] = target
}

function aliasAudiomRuntime (config) {
  if (!config.resolve) config.resolve = {}
  const aliases = {
    // The runtime imports the layerloader package entry. The browser barrel
    // statically imports OSM and GTFS, which this webpack cannot parse; the
    // runtime only needs the rules evaluator.
    '@xrnavigation/layerloader$': layerloaderRules,
    // Prebuilt packages (Ariakit, the runtime) import react/jsx-runtime by path.
    // Do not externalize that request to jimu-core/react: that build has no
    // jsx export. Do not bundle a second jsx-runtime either. Exact ($) and
    // prefix both, so a fully specified request cannot miss the shim.
    'react/jsx-runtime$': hostJsxRuntime,
    'react/jsx-dev-runtime$': hostJsxRuntime,
    'react/jsx-runtime': hostJsxRuntime,
    'react/jsx-dev-runtime': hostJsxRuntime
  }
  // Markdown's debug helper otherwise resolves the Node build (tty, util, os).
  widgetPackage(aliases, 'debug', 'debug/src/browser.js')
  widgetPackage(aliases, 'supports-color', 'supports-color/browser.js')
  // npm leaves empty node_modules/@turf folders inside turf packages. Webpack
  // stops there instead of using the hoisted package, then fails opening a
  // nested @turf/meta that was never installed.
  widgetPackage(aliases, '@turf', '@turf')
  config.resolve.alias = Object.assign({}, config.resolve.alias, aliases)
  const extensions = config.resolve.extensions || []
  if (!extensions.includes('.ts')) {
    config.resolve.extensions = ['.ts', '.tsx'].concat(extensions)
  }
  config.plugins = (config.plugins || []).concat([
    new webpack.NormalModuleReplacementPlugin(
      /^(?:.*[\\/])?react[\\/]jsx(-dev)?-runtime(\.js)?$/,
      (resource) => {
        if (!resource.request || resource.request.indexOf('host-jsx-runtime') !== -1) return
        resource.request = hostJsxRuntime
      }
    )
  ])
  // hls.js is an optional cacophony import. The widget does not play HLS.
  // One function, not an array concat: a later external that claims
  // react/jsx-runtime turns jsx into "not a function" and the builder
  // retries the widget until the tab freezes.
  const previousExternals = config.externals
  config.externals = [
    function (ctx, callback) {
      const request = ctx && ctx.request
      if (request === 'hls.js' || request === 'maplibre-gl' || request === 'next' || request === 'next/router') {
        return callback(null, 'commonjs ' + request)
      }
      if (request === 'react/jsx-runtime' || request === 'react/jsx-dev-runtime' ||
          request === 'react/jsx-runtime.js' || request === 'react/jsx-dev-runtime.js') {
        return callback()
      }
      const finish = (err, result) => {
        if (err || result !== undefined) return callback(err, result)
        // The runtime mounts its viewer with react-dom/client. A release that
        // does not externalize that request (1.18 and older externalize only
        // react, react-dom and react-dom/server) would bundle the react-dom
        // npm installed as the runtime's peer: a second React DOM beside the
        // host's React. React 18's react-dom has createRoot itself.
        if (request === 'react-dom/client') return callback(null, 'system jimu-core/react-dom')
        callback()
      }
      if (typeof previousExternals === 'function') return previousExternals(ctx, finish)
      if (Array.isArray(previousExternals)) {
        let index = 0
        const next = () => {
          if (index >= previousExternals.length) return finish()
          const item = previousExternals[index++]
          if (typeof item !== 'function') return next()
          item(ctx, (err, result) => {
            if (err || result !== undefined) return finish(err, result)
            next()
          })
        }
        return next()
      }
      finish()
    }
  ]
  config.module = config.module || {}
  const rules = config.module.rules || []
  config.module.rules = rules.concat([
    {
      // Webpack treats new URL(request, import.meta.url) as a dependency. The
      // DotPad SDK builds those URLs at runtime for optional liblouis files.
      // parser.url is the supported switch that leaves the calls alone.
      test: /[\\/]dotpad[\\/]DotPadSDK-3\.0\.2\.js$/,
      parser: {
        url: false
      }
    }
  ])
  // Dynamic import() writes widgets/chunks/*.js and loads them from
  // jimuConfig.baseUrl. A widget registered from
  // esri.xrnavigation.io/builder-versions/<version>/audiom/ is not under
  // /widgets/, so Experience Builder never retargets that public path.
  // Enterprise then 404s the audio engine and other lazy chunks. The
  // published build inlines those imports. Development does not: one inlined
  // program is large enough to freeze the builder tab while the widget loads.
  // Local chunks are served from this client.
  if (process.env.NODE_ENV !== 'development' && webpackSupportsEagerImports()) {
    config.module.rules.push({
      test: WIDGET_CODE,
      // Rule parser options are the parser's own options, not a map keyed
      // by module type. Nesting this under `javascript` left import() lazy,
      // so Enterprise still requested widgets/chunks from the portal.
      parser: {
        dynamicImportMode: 'eager'
      }
    })
  }
}

function webpackSupportsEagerImports () {
  try {
    const dir = path.dirname(require.resolve('webpack/package.json'))
    const schema = path.join(dir, 'schemas', 'WebpackOptions.json')
    if (fs.existsSync(schema)) {
      return fs.readFileSync(schema, 'utf8').includes('"dynamicImportMode"')
    }
    const check = path.join(dir, 'schemas', 'WebpackOptions.check.js')
    return fs.existsSync(check) && fs.readFileSync(check, 'utf8').includes('dynamicImportMode')
  } catch (err) {
    return false
  }
}

module.exports = function (webpackConfigs) {
  // 1.16+ passes the array from getWidgetsWebpackConfigs. 1.12–1.15 pass
  // the single object from getWidgetsWebpackConfig.
  const configs = Array.isArray(webpackConfigs) ? webpackConfigs : [webpackConfigs]
  configs.forEach((config) => {
    if (config && typeof config === 'object') aliasAudiomRuntime(config)
  })
  return webpackConfigs
}
