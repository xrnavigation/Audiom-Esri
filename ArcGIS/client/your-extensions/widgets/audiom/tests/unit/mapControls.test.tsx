import { React } from 'jimu-core'
import { fireEvent, render } from '@testing-library/react'
import * as fs from 'fs'
import * as path from 'path'
import defaultMessages from '../../src/runtime/translations/default'
import {
  centerOn,
  compassRotation,
  isMapFullscreen,
  MapControls,
  type MapControlView,
  resetBearing,
  toggleMapFullscreen,
  zoomButtonState,
  zoomBy
} from '../../src/runtime/mapControls'

describe('map control actions', () => {
  it('steps zoom by one and resets bearing without changing zoom', () => {
    const goTo = jest.fn(() => Promise.resolve())
    const view: MapControlView = { zoom: 8, rotation: 40, constraints: { minZoom: 0, maxZoom: 22 }, goTo }

    zoomBy(view, 1)
    zoomBy(view, -1)
    resetBearing(view)

    expect(goTo).toHaveBeenNthCalledWith(1, { zoom: 9 })
    expect(goTo).toHaveBeenNthCalledWith(2, { zoom: 7 })
    expect(goTo).toHaveBeenNthCalledWith(3, { rotation: 0 })
    expect(zoomButtonState(view)).toEqual({ zoomInDisabled: false, zoomOutDisabled: false })
  })

  it("treats Esri's unset zoom of -1 as unlimited and uses the effective limit", () => {
    expect(zoomButtonState({
      zoom: 16,
      constraints: { minZoom: -1, maxZoom: -1, effectiveMinZoom: 0, effectiveMaxZoom: 23 }
    })).toEqual({ zoomInDisabled: false, zoomOutDisabled: false })
    expect(zoomButtonState({ zoom: 15, constraints: { minZoom: -1, maxZoom: -1, effectiveMaxZoom: 23 } }).zoomInDisabled).toBe(false)
    expect(zoomButtonState({ zoom: 23, constraints: { maxZoom: -1, effectiveMaxZoom: 23 } }).zoomInDisabled).toBe(true)
    expect(zoomButtonState({ zoom: 0, constraints: { minZoom: -1, effectiveMinZoom: 0 } }).zoomOutDisabled).toBe(true)
  })

  it('disables a zoom button at the view limit and centers without a zoom', () => {
    const goTo = jest.fn(() => Promise.resolve())
    const view: MapControlView = { zoom: 22, constraints: { minZoom: 2, maxZoom: 22 }, goTo }

    expect(zoomButtonState(view).zoomInDisabled).toBe(true)
    expect(zoomButtonState({ ...view, zoom: 2 }).zoomOutDisabled).toBe(true)
    centerOn(view, -71.05, 42.36)
    expect(goTo).toHaveBeenCalledWith({ center: [-71.05, 42.36] })
  })

  it('resets a scene by heading and points the compass with the view', () => {
    const goTo = jest.fn(() => Promise.resolve())
    const scene: MapControlView = { camera: { heading: 90 }, goTo }

    expect(compassRotation(scene)).toBe(90)
    expect(compassRotation({ rotation: 15 })).toBe(15)
    resetBearing(scene)
    expect(goTo).toHaveBeenCalledWith({ heading: 0 })
  })

  it('fullscreens the map container and leaves it again', () => {
    const target = document.createElement('div')
    const requestFullscreen = jest.fn(() => Promise.resolve())
    const exitFullscreen = jest.fn(() => Promise.resolve())
    target.requestFullscreen = requestFullscreen
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null })
    document.exitFullscreen = exitFullscreen

    toggleMapFullscreen(target)
    expect(requestFullscreen).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => target })
    expect(isMapFullscreen(target)).toBe(true)
    toggleMapFullscreen(target)
    expect(exitFullscreen).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null })
  })

  it('ships every button name in every locale the manifest lists', () => {
    const folder = path.join(__dirname, '../../src/runtime/translations')
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../../manifest.json'), 'utf8')) as { translatedLocales: string[] }
    const keys = Object.keys(defaultMessages)
    for (const locale of manifest.translatedLocales.filter((item) => item !== 'en')) {
      let messages: Record<string, string> = {}
      const register = (_deps: unknown[], declare: (exporter: (value: Record<string, string>) => void) => { execute: () => void }) => {
        declare((value) => { messages = value }).execute()
      }
      // Experience Builder's translation files are SystemJS modules.
      new Function('System', fs.readFileSync(path.join(folder, `${locale}.js`), 'utf8'))({ register })
      expect([locale, Object.keys(messages)]).toEqual([locale, keys])
      for (const key of keys) {
        expect(messages[key]).toBeTruthy()
        expect(messages[key]).not.toBe(defaultMessages[key as keyof typeof defaultMessages])
      }
    }
  })
})

describe('MapControls', () => {
  const labels = defaultMessages

  it('drives the Esri view and recenters on the indicator', () => {
    const goTo = jest.fn(() => Promise.resolve())
    const view: MapControlView = { zoom: 10, rotation: 30, goTo }
    const { getByLabelText } = render(
      <MapControls
        view={view}
        labels={labels}
        indicator={{ longitude: -117.2, latitude: 34.05 }}
        fullscreenTarget={null}
        themeSource={null}
        show
      />
    )
    fireEvent.click(getByLabelText('Zoom in'))
    fireEvent.click(getByLabelText('Reset bearing to north'))
    fireEvent.click(getByLabelText('Recenter map on avatar'))
    expect(goTo.mock.calls).toEqual([
      [{ zoom: 11 }],
      [{ rotation: 0 }],
      [{ center: [-117.2, 34.05] }]
    ])
  })

  it('draws nothing when the widget setting hides the map controls', () => {
    const { container } = render(
      <MapControls view={{ zoom: 3 }} labels={labels} indicator={null} fullscreenTarget={null} themeSource={null} show={false} />
    )
    expect(container.querySelector('button')).toBeNull()
  })

  it('follows the light or dark theme the runtime sets on its container', async () => {
    const source = document.createElement('div')
    source.setAttribute('data-theme', 'dark')
    const { container } = render(
      <MapControls view={{ zoom: 3 }} labels={labels} indicator={null} fullscreenTarget={null} themeSource={source} show />
    )
    expect(container.querySelector('.audiom-map-controls')?.getAttribute('data-theme')).toBe('dark')
    source.setAttribute('data-theme', 'light')
    await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    expect(container.querySelector('.audiom-map-controls')?.getAttribute('data-theme')).toBe('light')
  })
})
