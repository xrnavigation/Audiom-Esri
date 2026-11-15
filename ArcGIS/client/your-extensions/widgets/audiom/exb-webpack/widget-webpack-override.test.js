/**
 * The overlay's paths are relative to client/webpack, where setup_arcgis.py
 * copies it. Run from ArcGIS/client:
 *   node your-extensions/widgets/audiom/exb-webpack/widget-webpack-override.test.js
 */
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const source = path.join(__dirname, 'widget-webpack-override.js')
const installed = path.resolve(__dirname, '../../../../webpack/widget-webpack-override.js')
const fakeFrontEnd = fs.mkdtempSync(path.join(require('os').tmpdir(), 'audiom-overlay-'))
const fakeRuntime = path.join(fakeFrontEnd, 'runtime')
fs.mkdirSync(path.join(fakeFrontEnd, 'src', 'runtime'), { recursive: true })
fs.mkdirSync(path.join(fakeFrontEnd, 'node_modules', '@xrnavigation', 'layerloader', 'dist', 'browser', 'rules'), { recursive: true })
fs.mkdirSync(fakeRuntime, { recursive: true })
fs.writeFileSync(path.join(fakeFrontEnd, 'src', 'runtime', 'exbEntry.ts'), 'export {}\n')
fs.writeFileSync(path.join(fakeRuntime, 'factory.ts'), 'export {}\n')
fs.writeFileSync(
  path.join(fakeFrontEnd, 'node_modules', '@xrnavigation', 'layerloader', 'dist', 'browser', 'rules', 'mapboxRuleProcessor.js'),
  'export {}\n'
)
process.env.AUDIOM_FRONTEND_ROOT = fakeFrontEnd
process.env.AUDIOM_RUNTIME_ROOT = fakeRuntime
fs.copyFileSync(source, installed)
const overlay = require(installed)

const hostCss = {
  test: (file) => /\.css$/.test(String(file)),
  use: [
    'style-loader',
    { loader: 'css-loader', options: { modules: true } },
    'sass-loader'
  ]
}
const config = {
  resolve: { extensions: ['.js'] },
  module: { rules: [hostCss] }
}

overlay([config])

const moduleCss = 'D:/Audiom-Front-End/src/components/Tabs/tabs.module.css'
const plainCss = 'D:/Audiom-Front-End/src/runtime/layout.css'
const otherCss = 'D:/widgets/other/style.css'
const frontEndTs = 'D:/Audiom-Front-End/src/modules/audioEngine.ts'

function matches (rule, file) {
  if (!rule || rule.test == null) return false
  if (typeof rule.test === 'function') return rule.test(file)
  if (rule.test instanceof RegExp) return rule.test.test(file)
  return false
}

assert.strictEqual(matches(hostCss, moduleCss), false, 'host css rule must not also compile Front-End modules')
assert.strictEqual(matches(hostCss, plainCss), false, 'plain Front-End css stays on the unhashed rule')
assert.strictEqual(matches(hostCss, otherCss), true, 'other widgets keep the host css rule')

const moduleRule = config.module.rules.find((rule) => (
  rule.use && matches(rule, moduleCss) && !matches(rule, plainCss)
))
assert.ok(moduleRule, 'Front-End module css needs its own rule')
const cssLoader = moduleRule.use.find((item) => item && item.loader === 'css-loader')
assert.strictEqual(cssLoader.options.modules.namedExport, false)
assert.strictEqual(cssLoader.options.modules.exportLocalsConvention, 'as-is')
assert.strictEqual(cssLoader.options.modules.auto, false)

const eager = config.module.rules.find((rule) => (
  rule.parser && rule.parser.javascript && rule.parser.javascript.dynamicImportMode === 'eager'
))
assert.ok(eager, 'Front-End dynamic imports must be inlined')
assert.strictEqual(matches(eager, frontEndTs), true)
assert.strictEqual(matches(eager, 'D:/widgets/other/src/runtime/widget.tsx'), false)

console.log('widget-webpack-override tests passed')
