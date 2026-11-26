/**
 * Audiom webpack overlay for Experience Builder.
 *
 * Edit this file. Do not edit ArcGIS/client/webpack/widget-webpack-override.js.
 * That copy is gitignored and setup_arcgis.py replaces it from here after
 * every Experience Builder extract. Paths below are relative to client/webpack,
 * which is where this file runs.
 *
 * AUDIOM_FRONTEND_ROOT is optional. Unset, the Front-End checkout is the
 * sibling repo next to Audiom-Esri. CI sets it because that checkout is
 * inside the workspace. A sibling without the bundled entry does not stop
 * the client. No environment variable is required, and no branch is checked out.
 */
const fs = require('fs')
const path = require('path')
const webpack = require('webpack')

const BUNDLED_ENTRY_RELATIVE = path.join('src', 'runtime', 'exbEntry.ts')
// The sibling checkout and the local worktree. Plain CSS under either must
// keep its class names. The worktree name is Audiom-Front-End-exb, which
// does not match Audiom-Front-End/. Missing that left the map controls
// on the host css-loader, which hashes .audiom-map-controls.
const FRONT_END_SRC_CSS = /Audiom-Front-End(?:-exb)?[\\/]src[\\/].+\.css$/
const FRONT_END_SRC_MODULE_CSS = /Audiom-Front-End(?:-exb)?[\\/]src[\\/].+\.module\.css$/
const FRONT_END_MODULE_CSS = /Audiom-Front-End(?:-exb)?[\\/].+\.module\.css$/
const FRONT_END_NODE_MODULES_CSS = /Audiom-Front-End(?:-exb)?[\\/]node_modules[\\/].+\.css$/
const FRONT_END_CODE = /(?:Audiom-Front-End(?:-exb)?|Audiom-Runtime|audiom-runtime|widgets[\\/]audiom)[\\/].+\.[cm]?[jt]sx?$/

function hasBundledEntry (root) {
  return Boolean(root) && fs.existsSync(path.join(root, BUNDLED_ENTRY_RELATIVE))
}

function siblingFrontEndRoot () {
  return path.resolve(__dirname, '../../../../Audiom-Front-End')
}

function bundledWorktreeRoot (sibling) {
  return path.resolve(sibling, '../Audiom-Front-End-exb')
}

function linkSiblingModules (sibling, worktree) {
  const modules = path.join(worktree, 'node_modules')
  const siblingModules = path.join(sibling, 'node_modules')
  if (fs.existsSync(modules) || !fs.existsSync(siblingModules)) return
  fs.symlinkSync(siblingModules, modules, 'junction')
}

function existingBundledCheckout (sibling) {
  const worktree = bundledWorktreeRoot(sibling)
  if (!hasBundledEntry(worktree)) return ''
  linkSiblingModules(sibling, worktree)
  return worktree
}

function frontEndRoot () {
  if (process.env.AUDIOM_FRONTEND_ROOT) {
    return path.resolve(process.env.AUDIOM_FRONTEND_ROOT)
  }
  const sibling = siblingFrontEndRoot()
  if (hasBundledEntry(sibling)) return sibling
  return existingBundledCheckout(sibling) || sibling
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
const siblingFrontEnd = siblingFrontEndRoot()
const bundledEntry = path.join(frontEnd, 'src', 'runtime', 'exbEntry.ts')
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
const exbEntry = resolveBundledEntry(bundledEntry)

if (!fs.existsSync(path.join(runtimeSrc, 'factory.ts'))) {
  throw new Error('Vendored Audiom runtime is missing: ' + runtimeSrc)
}
if (exbEntry === bundledEntry && !fs.existsSync(layerloaderRule)) {
  throw new Error(
    'Audiom Front-End dependencies are missing: ' + layerloaderRule +
    '. Run npm ci in the Front-End checkout.'
  )
}

function missingEntryStub () {
  const besideOverlay = path.join(__dirname, 'missing-exb-entry.js')
  if (fs.existsSync(besideOverlay)) return besideOverlay
  return path.join(
    __dirname,
    '../your-extensions/widgets/audiom/exb-webpack/missing-exb-entry.js'
  )
}

function resolveBundledEntry (entry) {
  if (fs.existsSync(entry)) return entry
  // CI names its checkout. A bad checkout must fail the build. A local
  // start does not: the sibling next to this repo is the checkout, and
  // the client still has to start when that branch has no bundled entry.
  if (process.env.AUDIOM_FRONTEND_ROOT) {
    throw new Error('Audiom Front-End entry is missing: ' + entry)
  }
  const where = fs.existsSync(siblingFrontEnd)
    ? 'The Front-End checkout next to this repo has no src/runtime/exbEntry.ts: ' + siblingFrontEnd
    : 'No Front-End checkout was found next to this repo: ' + siblingFrontEnd
  console.warn(
    'Audiom bundled program was not compiled. ' + where +
    '. No environment variable is required.'
  )
  return missingEntryStub()
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
      if (FRONT_END_SRC_CSS.test(normalized) && !/\.module\.css$/.test(normalized)) {
        return false
      }
      return original(file)
    }
  })
  // 1.12 and 1.13 run every .css file through sass-loader. That Sass build
  // treats modern CSS (rgb()/hsl() with alpha, min(), round()) as Sass
  // functions and fails. Later releases ship a Sass that leaves those calls
  // alone, so only the old client gets a static css-loader rule. A function
  // for rule.use breaks CSS modules: webpack then requires an ident.
  const oldSass = experienceBuilderMinor() != null && experienceBuilderMinor() <= 13
  if (oldSass) rules.forEach(excludeFrontEndCssFromSass)
  // css-loader 7 turns on namedExport for *.module.css. style-loader then
  // publishes `content.locals` as the default import. Named exports leave
  // that default undefined, so `styles.tabList` throws and the menu dies.
  // Enterprise registers the widget by URL, outside the widgets folder, so
  // this is the build that customers actually load.
  const namedExportBreaksDefaultImport = cssLoaderMajor() >= 7
  if (namedExportBreaksDefaultImport) rules.forEach(excludeFrontEndModuleCss)
  const frontEndCssRules = [{
    test: FRONT_END_SRC_CSS,
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
  }]
  if (namedExportBreaksDefaultImport) {
    frontEndCssRules.push({
      test: FRONT_END_SRC_MODULE_CSS,
      use: [
        'style-loader',
        { loader: 'css-loader', options: frontEndModuleCssOptions() }
      ]
    })
  }
  if (oldSass && !namedExportBreaksDefaultImport) {
    frontEndCssRules.push(
      {
        test: FRONT_END_MODULE_CSS,
        use: hostCssUse(rules, true)
      },
      {
        test: FRONT_END_NODE_MODULES_CSS,
        exclude: /\.module\.css$/,
        use: hostCssUse(rules, false)
      }
    )
  }
  config.module.rules = frontEndCssRules.concat(rules, [
    {
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
  // Enterprise then 404s the audio engine, cacophony, and road-following
  // chunks. The published build inlines those imports. Development does
  // not: one inlined program is large enough to freeze the builder tab
  // while the widget loads. Local chunks are served from this client.
  if (process.env.NODE_ENV !== 'development' && webpackSupportsEagerImports()) {
    config.module.rules.push({
      test: FRONT_END_CODE,
      // Rule parser options are the parser's own options, not a map keyed
      // by module type. Nesting this under `javascript` left import() lazy,
      // so Enterprise still requested widgets/chunks from the portal.
      parser: {
        dynamicImportMode: 'eager'
      }
    })
  }
}

function hostCssUse (rules, modules) {
  const chains = []
  rules.forEach((rule) => {
    if (!rule || !Array.isArray(rule.use)) return
    if (!rule.use.some((item) => loaderName(item).indexOf('sass-loader') !== -1)) return
    chains.push(rule.use)
  })
  const preferred = chains.find((use) => use.some((item) => loaderName(item).indexOf('style-loader') !== -1)) || chains[0]
  const found = preferred && preferred.filter((item) => {
    const name = loaderName(item)
    return name.indexOf('sass-loader') === -1 && name.indexOf('resolve-url-loader') === -1
  }).map((item) => {
    // Theme rules extract CSS with a plugin the widget config does not
    // register. Inject widget styles instead.
    if (loaderName(item).indexOf('mini-css-extract-plugin') !== -1) return 'style-loader'
    if (typeof item === 'string' || loaderName(item).indexOf('css-loader') === -1) return item
    const hostModules = item.options && item.options.modules
    // Do not set auto: false. css-loader 7 reads that as modules disabled.
    const nextModules = modules && hostModules && typeof hostModules === 'object'
      ? Object.assign({}, hostModules)
      : modules
    return Object.assign({}, item, {
      options: Object.assign({}, item.options, {
        url: false,
        modules: nextModules,
        importLoaders: 0
      })
    })
  })
  if (found && found.length) return found
  return [
    'style-loader',
    { loader: 'css-loader', options: { url: false, modules: modules } }
  ]
}

function loaderName (item) {
  if (typeof item === 'string') return item
  if (item && typeof item.loader === 'string') return item.loader
  return ''
}

function packageMajor (name) {
  try {
    const pkg = JSON.parse(fs.readFileSync(require.resolve(name + '/package.json'), 'utf8'))
    const match = String(pkg.version || '').match(/^(\d+)/)
    return match ? Number(match[1]) : 0
  } catch (err) {
    return 0
  }
}

function cssLoaderMajor () {
  return packageMajor('css-loader')
}

function frontEndModuleCssOptions () {
  // css-loader 7 treats `auto: false` as modules disabled, not as "always
  // a module". The published rebuild kept the raw `.tabList` class and
  // exported no locals, so style-loader's default import was undefined.
  return {
    url: false,
    importLoaders: 0,
    modules: {
      namedExport: false,
      exportLocalsConvention: 'as-is'
    }
  }
}

function excludeFrontEndModuleCss (rule) {
  if (!rule || typeof rule !== 'object') return
  if (Array.isArray(rule.oneOf)) rule.oneOf.forEach(excludeFrontEndModuleCss)
  if (Array.isArray(rule.rules)) rule.rules.forEach(excludeFrontEndModuleCss)
  if (!rule.use || !rule.test) return
  const original = rule.test
  rule.test = (file) => {
    const normalized = String(file).replace(/\\/g, '/').split('?')[0]
    if (FRONT_END_SRC_MODULE_CSS.test(normalized)) return false
    if (typeof original === 'function') return original(file)
    if (original instanceof RegExp) return original.test(file)
    if (Array.isArray(original)) {
      return original.some((item) => item instanceof RegExp && item.test(file))
    }
    return true
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

function experienceBuilderMinor () {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'))
    const match = String(pkg.version || '').match(/^1\.(\d+)/)
    return match ? Number(match[1]) : null
  } catch (err) {
    return null
  }
}

function excludeFrontEndCssFromSass (rule) {
  if (!rule || typeof rule !== 'object') return
  if (Array.isArray(rule.oneOf)) rule.oneOf.forEach(excludeFrontEndCssFromSass)
  if (Array.isArray(rule.rules)) rule.rules.forEach(excludeFrontEndCssFromSass)
  if (!Array.isArray(rule.use)) return
  if (!rule.use.some((item) => loaderName(item).indexOf('sass-loader') !== -1)) return
  const original = rule.test
  rule.test = (file) => {
    const normalized = String(file).replace(/\\/g, '/').split('?')[0]
    if (/Audiom-Front-End(?:-exb)?\//.test(normalized) && normalized.endsWith('.css')) return false
    if (typeof original === 'function') return original(file)
    if (original instanceof RegExp) return original.test(file)
    if (Array.isArray(original)) {
      return original.some((item) => item instanceof RegExp && item.test(file))
    }
    return true
  }
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
