/**
 * Ariakit's prebuilt ESM imports "react/jsx-runtime" by path. Experience
 * Builder externalizes only the bare "react" request. Its jimu-core/react
 * build does not export jsx, jsxs, or jsxDEV. Bundling Front-End's own
 * jsx-runtime crashes because that build calls a host function that is absent.
 * Pointing the request at jimu-core/react makes jsx "not a function" and
 * Experience Builder retries widget load until the browser freezes.
 *
 * This shim is the only module webpack should resolve for those requests.
 * It delegates to the already-external host React.createElement, so there
 * is still one React and Ariakit gets a real jsx function.
 *
 * Written without object rest so webpack can parse it without a loader.
 * setup_arcgis.py copies this file next to widget-webpack-override.js.
 */
var React = require('react')

function copyProps (props, key) {
  var rest = {}
  var name
  if (props) {
    for (name in props) {
      if (Object.prototype.hasOwnProperty.call(props, name) && name !== 'children') {
        rest[name] = props[name]
      }
    }
  }
  if (key !== undefined) rest.key = key
  return rest
}

function jsx (type, props, key) {
  var children = props && props.children
  var rest = copyProps(props, key)
  if (!props || !Object.prototype.hasOwnProperty.call(props, 'children')) {
    return React.createElement(type, rest)
  }
  return React.createElement(type, rest, children)
}

function jsxs (type, props, key) {
  var children = props && props.children
  var rest = copyProps(props, key)
  if (!props || !Object.prototype.hasOwnProperty.call(props, 'children')) {
    return React.createElement(type, rest)
  }
  if (Array.isArray(children)) {
    return React.createElement.apply(React, [type, rest].concat(children))
  }
  return React.createElement(type, rest, children)
}

exports.Fragment = React.Fragment
exports.jsx = jsx
exports.jsxs = jsxs
exports.jsxDEV = jsxs
