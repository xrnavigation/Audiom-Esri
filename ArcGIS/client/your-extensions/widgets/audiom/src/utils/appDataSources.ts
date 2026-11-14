import { getAppStore } from 'jimu-core'

/**
 * Data sources from the published app, overlaid by the builder draft.
 * The builder copy is what a selection writes before the widget props update.
 * A missing portal URL on that copy is the CONT_0001 item error.
 */
export function dataSourcesFromAppState<T> (): Record<string, T> {
  const state = getAppStore().getState() as {
    appConfig?: { dataSources?: Record<string, T> }
    appStateInBuilder?: { appConfig?: { dataSources?: Record<string, T> } }
  }
  return {
    ...(state.appConfig?.dataSources || {}),
    ...(state.appStateInBuilder?.appConfig?.dataSources || {})
  }
}
