/**
 * Widget stand-in for the layerloader package entry.
 *
 * The browser barrel statically imports OSM and GTFS. Those files import
 * node: schemes and named Turf exports that this webpack cannot parse.
 * The embed only needs the rules evaluator.
 */
export { createEvaluator } from '@xrnavigation/layerloader/rules/mapboxRuleProcessor'
export { materializeRuntimeRuleSet } from '@xrnavigation/layerloader/rules/materializeRuntimeRuleSet'
