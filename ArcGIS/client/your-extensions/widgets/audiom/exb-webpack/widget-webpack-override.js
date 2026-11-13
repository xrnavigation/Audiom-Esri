/**
 * Audiom webpack overlay for Experience Builder.
 *
 * Edit this file. Do not edit ArcGIS/client/webpack/widget-webpack-override.js.
 * That copy is gitignored and setup_arcgis.py replaces it from here after
 * every Experience Builder extract. Paths below are relative to client/webpack,
 * which is where this file runs.
 *
 * AUDIOM_FRONTEND_ROOT is the Front-End checkout. Unset, it is the sibling
 * repo next to Audiom-Esri. CI sets it to a checkout inside the workspace.
 */
const fs = require('fs')
const path = require('path')
const webpack = require('webpack')

function frontEndRoot () {
  if (process.env.AUDIOM_FRONTEND_ROOT) {
    return path.resolve(process.env.AUDIOM_FRONTEND_ROOT)
  }
  return path.resolve(__dirname, '../../../../Audiom-Front-End')
}

function runtimeRoot () {
  // The last working local compile used the sibling checkout. Front-End's
  // node_modules link points there too. CI has no sibling, so the vendored
  // copy under your-extensions is the fallback.
  if (process.env.AUDIOM_RUNTIME_ROOT) {
    const given = path.resolve(process.env.AUDIOM_RUNTIME_ROOT)
    return fs.existsSync(path.join(given, 'factory.ts')) ? given : path.join(given, 'src')
  }
  const sibling = path.resolve(__dirname, '../../../../Audiom-Runtime/src')
  if (fs.existsSync(path.join(sibling, 'factory.ts'))) return sibling
  return path.resolve(__dirname, '../your-extensions/shared/audiom-runtime/src')
}

const frontEnd = frontEndRoot()
const frontEndModules = path.join(frontEnd, 'node_modules')
const runtimeSrc = runtimeRoot()
const exbEntry = path.join(frontEnd, 'src', 'runtime', 'exbEntry.ts')
const hostJsxRuntime = path.join(__dirname, 'host-jsx-runtime.js')
const layerloaderRule = path.join(
  frontEndModules,
  '@xrnavigation',
  'layerloader',
  'dist',
  'browser',
  'rules',
  'mapboxRuleProcessor.js'
)

if (!fs.existsSync(path.join(runtimeSrc, 'factory.ts'))) {
  throw new Error('Vendored Audiom runtime is missing: ' + runtimeSrc)
}
if (!fs.existsSync(exbEntry)) {
  throw new Error(
    'Audiom Front-End entry is missing: ' + exbEntry +
    '. Set AUDIOM_FRONTEND_ROOT to the Front-End checkout.'
  )
}
if (!fs.existsSync(layerloaderRule)) {
  throw new Error(
    'Audiom Front-End dependencies are missing: ' + layerloaderRule +
    '. Run npm ci in the Front-End checkout.'
  )
}

const runtimeRequests = {
  '@xrnavigation/audiom-runtime/in-process': path.join(runtimeSrc, 'factory.ts'),
  '@xrnavigation/audiom-runtime/contract': path.join(runtimeSrc, 'index.ts')
}
const transportSrc = path.join(runtimeSrc, 'transport.ts')
if (fs.existsSync(transportSrc)) {
  runtimeRequests['@xrnavigation/audiom-runtime/transport'] = transportSrc
}

console.log('Audiom webpack overlay')
console.log('  front-end:', frontEnd)
console.log('  runtime:', runtimeSrc)
console.log('  entry:', exbEntry)

/**
 * Front-End imports @xrnavigation/audiom-runtime. Its compiled dist omits
 * file extensions, which webpack 5 rejects, and a node_modules copy wins
 * over a resolve alias. Compile the vendored TypeScript instead.
 */
function aliasAudiomRuntimeToSource (config) {
  if (!config.resolve) config.resolve = {}
  config.resolve.alias = Object.assign({}, config.resolve.alias, runtimeRequests, {
    'audiom-front-end/runtime/exbEntry': exbEntry,
    'audiom-front-end/runtime/exbEntry$': exbEntry,
    // Markdown's debug helper otherwise resolves the Node build (tty, util, os).
    debug: path.join(frontEndModules, 'debug/src/browser.js'),
    'supports-color': path.join(frontEndModules, 'supports-color/browser.js'),
    // npm leaves empty node_modules/@turf folders inside turf packages. Webpack
    // stops there instead of using the hoisted package, then fails opening a
    // nested @turf/meta that was never installed.
    '@turf': path.join(frontEndModules, '@turf'),
    // Bundled mode evaluates the same rules engine as the embed. The browser
    // build avoids the Node entry. Exact requests, so other package imports
    // are unchanged.
    '@xrnavigation/layerloader$': path.join(__dirname, 'layerloader-rules.js'),
    // Source imports the dist path because the Front-End tsconfig uses
    // moduleResolution "node" and cannot see the package exports subpath.
    '@xrnavigation/layerloader/dist/rules/mapboxRuleProcessor.js': path.join(
      frontEndModules,
      '@xrnavigation/layerloader/dist/browser/rules/mapboxRuleProcessor.js'
    ),
    '@xrnavigation/layerloader/dist/rules/materializeRuntimeRuleSet.js': path.join(
      frontEndModules,
      '@xrnavigation/layerloader/dist/browser/rules/materializeRuntimeRuleSet.js'
    ),
    '@mapbox/mapbox-gl-style-spec': path.join(frontEndModules, '@mapbox/mapbox-gl-style-spec'),
    // Prebuilt Front-End packages (Ariakit) import react/jsx-runtime by path.
    // Do not externalize that request to jimu-core/react: that build has no
    // jsx export. Do not bundle Front-End's jsx-runtime either. Exact ($)
    // and prefix both, so a fully specified request cannot miss the shim.
    'react/jsx-runtime$': hostJsxRuntime,
    'react/jsx-dev-runtime$': hostJsxRuntime,
    'react/jsx-runtime': hostJsxRuntime,
    'react/jsx-dev-runtime': hostJsxRuntime
  })
  const extensions = config.resolve.extensions || []
  if (!extensions.includes('.ts')) {
    config.resolve.extensions = ['.ts', '.tsx'].concat(extensions)
  }
  config.plugins = (config.plugins || []).concat([
    new webpack.NormalModuleReplacementPlugin(
      /^@xrnavigation\/audiom-runtime\/(in-process|contract|transport)$/,
      (resource) => {
        const replacement = runtimeRequests[resource.request]
        if (replacement) resource.request = replacement
      }
    ),
    new webpack.NormalModuleReplacementPlugin(
      /^audiom-front-end\/runtime\/exbEntry$/,
      (resource) => {
        resource.request = exbEntry
      }
    ),
    // embedLabelPlacement imports the sibling checkout by a relative path.
    // CI checks Front-End out inside the workspace, so that walk leaves
    // GITHUB_WORKSPACE and webpack reports a missing browser alias.
    new webpack.NormalModuleReplacementPlugin(
      /Audiom-Front-End[\\/]/,
      (resource) => {
        const normalized = String(resource.request).replace(/\\/g, '/')
        const marker = 'Audiom-Front-End/'
        const index = normalized.lastIndexOf(marker)
        if (index === -1) return
        resource.request = path.join(frontEnd, normalized.slice(index + marker.length))
      }
    ),
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
      if (typeof previousExternals === 'function') return previousExternals(ctx, callback)
      if (Array.isArray(previousExternals)) {
        let index = 0
        const next = () => {
          if (index >= previousExternals.length) return callback()
          const item = previousExternals[index++]
          if (typeof item !== 'function') return next()
          item(ctx, (err, result) => {
            if (err || result !== undefined) return callback(err, result)
            next()
          })
        }
        return next()
      }
      callback()
    }
  ]
  // Webpack treats new URL(request, import.meta.url) as a dependency. The
  // DotPad SDK builds those URLs at runtime for optional liblouis files.
  // parser.url is the supported switch that leaves the calls alone.
  config.module = config.module || {}
  // Experience Builder's css-loader enables modules for every stylesheet, so a
  // plain Front-End .css file would ship hashed class names that match nothing.
  // Keep those class names, and let *.module.css keep the normal module rule.
  const rules = config.module.rules || []
  rules.forEach((rule) => {
    if (!rule || typeof rule.test !== 'function') return
    const original = rule.test
    rule.test = (file) => {
      const normalized = String(file).replace(/\\/g, '/')
      if (/Audiom-Front-End\/src\/.+\.css$/.test(normalized) && !/\.module\.css$/.test(normalized)) {
        return false
      }
      return original(file)
    }
  })
  config.module.rules = [{
    test: /Audiom-Front-End[\\/]src[\\/].+\.css$/,
    exclude: /\.module\.css$/,
    use: [
      'style-loader',
      {
        loader: 'css-loader',
        options: {
          url: false,
          modules: false
        }
      }
    ]
  }].concat(rules, [
    {
      test: /[\\/]dotpad[\\/]DotPadSDK-3\.0\.2\.js$/,
      parser: {
        url: false
      }
    }
  ])
}

module.exports = function (webpackConfigs) {
  // 1.16+ passes the array from getWidgetsWebpackConfigs. 1.12–1.15 pass
  // the single object from getWidgetsWebpackConfig. Leaving that object
  // untouched is why those builds cannot resolve the Front-End entry.
  const configs = Array.isArray(webpackConfigs) ? webpackConfigs : [webpackConfigs]
  configs.forEach((config) => {
    if (config && typeof config === 'object') aliasAudiomRuntimeToSource(config)
  })
  return webpackConfigs
}
