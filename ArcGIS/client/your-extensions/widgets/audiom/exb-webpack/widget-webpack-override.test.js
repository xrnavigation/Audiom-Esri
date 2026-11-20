/**
 * The overlay's paths are relative to client/webpack, where setup_arcgis.py
 * copies it. Run from ArcGIS/client after npm ci in widgets/audiom:
 *   node your-extensions/widgets/audiom/exb-webpack/widget-webpack-override.test.js
 */
const assert = require('assert')
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const source = path.join(__dirname, 'widget-webpack-override.js')
const installed = path.resolve(__dirname, '../../../../webpack/widget-webpack-override.js')
process.env.NODE_ENV = 'production'
fs.copyFileSync(source, installed)
const overlay = require(installed)

function externalFor (config, request) {
  return new Promise((resolve, reject) => {
    config.externals[0]({ request }, (err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })
}

function matches (rule, file) {
  if (!rule || rule.test == null) return false
  if (typeof rule.test === 'function') return rule.test(file)
  if (rule.test instanceof RegExp) return rule.test.test(file)
  return false
}

async function main () {
  // The host claims react and react-dom, as Experience Builder 1.18 does.
  const hostExternals = function ({ request }, callback) {
    if (request === 'react' || request === 'react-dom') return callback(null, 'system jimu-core/' + request)
    callback()
  }
  const config = {
    resolve: { extensions: ['.js'] },
    module: { rules: [] },
    externals: hostExternals
  }
  overlay([config])

  const alias = config.resolve.alias
  assert.strictEqual(alias['@xrnavigation/layerloader$'], path.join(__dirname, 'layerloader-rules.js'))
  assert.ok(fs.existsSync(alias['@xrnavigation/layerloader$']), 'the layerloader shim is used from its source folder')
  assert.strictEqual(alias['react/jsx-runtime'], path.resolve(__dirname, '../../../../webpack/host-jsx-runtime.js'))
  assert.strictEqual(alias['audiom-front-end/runtime/exbEntry'], undefined, 'no Front-End entry is compiled')

  assert.strictEqual(await externalFor(config, 'react'), 'system jimu-core/react')
  assert.strictEqual(await externalFor(config, 'react-dom/client'), 'system jimu-core/react-dom',
    'react-dom/client must be the host React DOM, not the peer copy npm installs')
  assert.strictEqual(await externalFor(config, 'hls.js'), 'commonjs hls.js')
  assert.strictEqual(await externalFor(config, 'react/jsx-runtime'), undefined)
  assert.strictEqual(await externalFor(config, 'mobx'), undefined)

  // A release that externalizes react-dom/client itself keeps its own answer.
  const newer = {
    resolve: {},
    module: { rules: [] },
    externals: [function ({ request }, callback) {
      if (request === 'react-dom/client') return callback(null, 'system jimu-core/react-dom-client')
      callback()
    }]
  }
  overlay([newer])
  assert.strictEqual(await externalFor(newer, 'react-dom/client'), 'system jimu-core/react-dom-client')

  const eager = config.module.rules.find((rule) => rule.parser && rule.parser.dynamicImportMode === 'eager')
  assert.ok(eager, 'the published build inlines dynamic imports')
  assert.strictEqual(eager.parser.javascript, undefined)
  assert.strictEqual(matches(eager, 'D:/client/your-extensions/widgets/audiom/src/runtime/widget.tsx'), true)
  assert.strictEqual(matches(eager, 'D:/client/your-extensions/widgets/audiom/node_modules/@xrnavigation/audiom-runtime/dist/in-process.js'), true)
  assert.strictEqual(matches(eager, 'D:/client/your-extensions/widgets/other/src/runtime/widget.tsx'), false)
  assert.ok(config.module.rules.some((rule) => rule.parser && rule.parser.url === false && matches(rule, 'x/dotpad/DotPadSDK-3.0.2.js')))

  const development = { resolve: {}, module: { rules: [] } }
  process.env.NODE_ENV = 'development'
  overlay([development])
  assert.strictEqual(
    development.module.rules.some((rule) => rule.parser && rule.parser.dynamicImportMode === 'eager'),
    false,
    'development must not inline imports; that file freezes the builder tab'
  )
  process.env.NODE_ENV = 'production'

  // Without the installed package the build stops and says what to run.
  const modules = path.resolve(__dirname, '../node_modules')
  const hidden = modules + '.hidden-for-test'
  fs.renameSync(modules, hidden)
  try {
    const missing = spawnSync(process.execPath, ['-e', 'require(' + JSON.stringify(installed) + ')'], { encoding: 'utf8' })
    assert.notStrictEqual(missing.status, 0)
    assert.match((missing.stderr || '') + (missing.stdout || ''), /Run npm ci in ArcGIS\/client\/your-extensions\/widgets\/audiom/)
  } finally {
    fs.renameSync(hidden, modules)
  }

  console.log('widget-webpack-override tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
