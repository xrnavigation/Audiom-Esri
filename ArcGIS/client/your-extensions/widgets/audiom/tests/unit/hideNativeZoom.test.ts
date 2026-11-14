import { hideNativeZoom, type MountedMapView } from '../../src/runtime/esriMapSurface'

describe('hideNativeZoom', () => {
  it('removes Esri zoom and hides the widget if it is already in the DOM', () => {
    const container = document.createElement('div')
    const zoom = document.createElement('div')
    zoom.className = 'esri-zoom'
    container.appendChild(zoom)
    const view: MountedMapView = {
      container,
      ui: { components: ['attribution', 'zoom', 'navigation-toggle'] }
    }

    hideNativeZoom(view)

    expect(view.ui?.components).toEqual(['attribution'])
    expect(container.querySelector('#audiom-hide-esri-zoom')).toBeTruthy()
  })
})
