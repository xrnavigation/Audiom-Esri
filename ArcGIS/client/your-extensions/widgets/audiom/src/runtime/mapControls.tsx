/**
 * Zoom, compass, fullscreen, and center-on-indicator buttons over the Esri
 * map. The host owns the visual map and its camera, so these buttons drive
 * the Esri view directly; the Audiom runtime draws no camera controls.
 * The widget's "show map controls" setting turns them on and off.
 *
 * Moved from the Front-End feature/1977-use-map-viewer embed
 * (EmbedMapControls, MapNavigationControls, mapControlActions, mapFullscreen,
 * mapNavigationControls.css). Metrics and icons match MapLibre GL JS 6.9.0.
 */
import { React } from 'jimu-core'

const { useEffect, useState } = React

export interface MapControlView {
  zoom?: number
  /** MapView: clockwise degrees of north from the top of the view. */
  rotation?: number
  /** SceneView compass direction, clockwise from north. */
  camera?: { heading?: number }
  constraints?: {
    minZoom?: number
    maxZoom?: number
    /**
     * Esri leaves minZoom and maxZoom at -1 when the author did not set
     * them. These are the limits the view will actually stop at.
     */
    effectiveMinZoom?: number
    effectiveMaxZoom?: number
  }
  goTo?: (target: {
    zoom?: number
    rotation?: number
    heading?: number
    center?: [number, number]
  }) => Promise<unknown>
  resize?: () => void
  watch?: (name: string, handler: () => void) => { remove?: () => void } | undefined
}

/**
 * The buttons' accessible names. The widget owns them: its
 * runtime/translations hold them for every locale it ships.
 */
export interface MapControlLabels {
  zoomIn: string
  zoomOut: string
  resetBearing: string
  enterFullscreen: string
  exitFullscreen: string
  recenterMap: string
}

const AT_LIMIT = 1e-6

export function compassRotation (view: MapControlView): number {
  if (typeof view.rotation === 'number') return view.rotation
  const heading = view.camera?.heading
  return typeof heading === 'number' ? heading : 0
}

/**
 * A set zoom of -1 means "not set" on an Esri view. Prefer the effective
 * limit, which already includes that setting, the scale cap, and the basemap.
 */
function zoomBound (set: number | undefined, effective: number | undefined): number | undefined {
  if (typeof effective === 'number' && Number.isFinite(effective) && effective >= 0) return effective
  if (typeof set === 'number' && Number.isFinite(set) && set >= 0) return set
  return undefined
}

export function zoomButtonState (view: MapControlView): { zoomInDisabled: boolean, zoomOutDisabled: boolean } {
  const zoom = view.zoom
  if (typeof zoom !== 'number' || !Number.isFinite(zoom)) {
    return { zoomInDisabled: false, zoomOutDisabled: false }
  }
  const min = zoomBound(view.constraints?.minZoom, view.constraints?.effectiveMinZoom)
  const max = zoomBound(view.constraints?.maxZoom, view.constraints?.effectiveMaxZoom)
  return {
    zoomInDisabled: typeof max === 'number' && zoom >= max - AT_LIMIT,
    zoomOutDisabled: typeof min === 'number' && zoom <= min + AT_LIMIT
  }
}

function settle (pending: Promise<unknown> | undefined): void {
  void pending?.catch(() => {
    // A newer goTo interrupts the previous one. That is not a failure.
  })
}

/** One MapLibre zoom step. Esri clamps to the view's own limits. */
export function zoomBy (view: MapControlView, delta: number): void {
  if (!view.goTo || typeof view.zoom !== 'number' || !Number.isFinite(view.zoom)) return
  settle(view.goTo({ zoom: view.zoom + delta }))
}

/** MapLibre resetNorth. MapView uses rotation; a scene uses heading. */
export function resetBearing (view: MapControlView): void {
  if (!view.goTo) return
  if (typeof view.rotation === 'number') {
    settle(view.goTo({ rotation: 0 }))
    return
  }
  settle(view.goTo({ heading: 0 }))
}

/** MapLibre flyTo({ center }): zoom stays where the reader left it. */
export function centerOn (view: MapControlView, longitude: number, latitude: number): void {
  if (!view.goTo) return
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return
  settle(view.goTo({ center: [longitude, latitude] }))
}

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
  webkitCancelFullScreen?: () => Promise<void> | void
}

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

export const PSEUDO_FULLSCREEN_CLASS = 'audiom-map-pseudo-fullscreen'

function currentFullscreenElement (): Element | null {
  const doc = document as FullscreenDocument
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null
}

export function isMapFullscreen (target: HTMLElement | null): boolean {
  if (!target) return false
  if (currentFullscreenElement() === target) return true
  return target.classList.contains(PSEUDO_FULLSCREEN_CLASS)
}

/** Native fullscreen when the browser allows it, otherwise MapLibre's CSS fallback. */
export function toggleMapFullscreen (target: HTMLElement | null): void {
  if (!target) return
  if (isMapFullscreen(target)) {
    exitMapFullscreen(target)
    return
  }
  enterMapFullscreen(target)
}

function enterMapFullscreen (target: HTMLElement): void {
  const element = target as FullscreenElement
  const request = element.requestFullscreen ?? element.webkitRequestFullscreen
  if (!request) {
    target.classList.add(PSEUDO_FULLSCREEN_CLASS)
    return
  }
  try {
    const pending = request.call(element)
    void Promise.resolve(pending).catch(() => {
      target.classList.add(PSEUDO_FULLSCREEN_CLASS)
    })
  } catch {
    target.classList.add(PSEUDO_FULLSCREEN_CLASS)
  }
}

function exitMapFullscreen (target: HTMLElement): void {
  if (target.classList.contains(PSEUDO_FULLSCREEN_CLASS)) {
    target.classList.remove(PSEUDO_FULLSCREEN_CLASS)
    return
  }
  const doc = document as FullscreenDocument
  const exit = document.exitFullscreen ?? doc.webkitExitFullscreen ?? doc.webkitCancelFullScreen
  if (!exit) {
    target.classList.remove(PSEUDO_FULLSCREEN_CLASS)
    return
  }
  try {
    void Promise.resolve(exit.call(document)).catch(() => {
      target.classList.remove(PSEUDO_FULLSCREEN_CLASS)
    })
  } catch {
    target.classList.remove(PSEUDO_FULLSCREEN_CLASS)
  }
}

function watchView (view: MapControlView, name: string, handler: () => void): { remove?: () => void } | null {
  if (!view.watch) return null
  try {
    return view.watch(name, handler) ?? null
  } catch {
    return null
  }
}

export interface MapControlsProps {
  view: MapControlView | null | undefined
  labels: MapControlLabels
  /** The navigation indicator, or null before the runtime reports one. */
  indicator: { longitude: number, latitude: number } | null
  /** Widget box that holds the Esri map and the runtime overlay. */
  fullscreenTarget: HTMLElement | null
  /** The runtime's container. Its viewer writes the light or dark theme on it. */
  themeSource: HTMLElement | null
  show: boolean
}

/** The light or dark theme the runtime's viewer set on its container. */
function useRuntimeTheme (source: HTMLElement | null): string | undefined {
  const [theme, setTheme] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!source) return
    const read = () => { setTheme(source.getAttribute('data-theme') ?? undefined) }
    read()
    const observer = new MutationObserver(read)
    observer.observe(source, { attributes: true, attributeFilter: ['data-theme'] })
    return () => { observer.disconnect() }
  }, [source])
  return theme
}

/** The map's top-right controls, aimed at the Esri view. */
export function MapControls (props: MapControlsProps): React.JSX.Element | null {
  const { view, labels, indicator, fullscreenTarget, show } = props
  const theme = useRuntimeTheme(props.themeSource)
  const [zoomInDisabled, setZoomInDisabled] = useState(false)
  const [zoomOutDisabled, setZoomOutDisabled] = useState(false)
  const [bearing, setBearing] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!view) return
    const read = () => {
      const limits = zoomButtonState(view)
      setZoomInDisabled(limits.zoomInDisabled)
      setZoomOutDisabled(limits.zoomOutDisabled)
      setBearing(compassRotation(view))
    }
    read()
    const handles = ['zoom', 'rotation', 'camera']
      .map((name) => watchView(view, name, read))
      .filter((handle): handle is { remove?: () => void } => handle != null)
    return () => {
      for (const handle of handles) handle.remove?.()
    }
  }, [view])

  useEffect(() => {
    const sync = () => {
      setFullscreen(isMapFullscreen(fullscreenTarget))
      view?.resize?.()
    }
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [fullscreenTarget, view])

  if (!show || !view) return null
  const fullscreenLabel = fullscreen ? labels.exitFullscreen : labels.enterFullscreen
  return (
    <div className="audiom-map-controls audiom-map-controls--corner" data-theme={theme}>
      <style>{MAP_CONTROLS_CSS}</style>
      <div className="maplibregl-ctrl-group" onContextMenu={(event) => event.preventDefault()}>
        <ControlButton
          className="maplibregl-ctrl-zoom-in"
          label={labels.zoomIn}
          disabled={zoomInDisabled}
          onClick={() => zoomBy(view, 1)}
        />
        <ControlButton
          className="maplibregl-ctrl-zoom-out"
          label={labels.zoomOut}
          disabled={zoomOutDisabled}
          onClick={() => zoomBy(view, -1)}
        />
        <ControlButton
          className="maplibregl-ctrl-compass"
          label={labels.resetBearing}
          onClick={() => resetBearing(view)}
          iconStyle={{ transform: `rotate(${bearing}deg)` }}
        />
      </div>
      <div className="maplibregl-ctrl-group">
        <ControlButton
          className={fullscreen ? 'maplibregl-ctrl-shrink' : 'maplibregl-ctrl-fullscreen'}
          label={fullscreenLabel}
          onClick={() => {
            toggleMapFullscreen(fullscreenTarget)
            setFullscreen(isMapFullscreen(fullscreenTarget))
            view.resize?.()
          }}
        />
      </div>
      <div className="maplibregl-ctrl-group">
        <button
          type="button"
          className="audiom-map-recenter"
          title={labels.recenterMap}
          aria-label={labels.recenterMap}
          onClick={() => {
            if (indicator) centerOn(view, indicator.longitude, indicator.latitude)
          }}
        >
          <NavigationIndicatorIcon />
        </button>
      </div>
    </div>
  )
}

function ControlButton (props: {
  className: string
  label: string
  disabled?: boolean
  onClick: () => void
  iconStyle?: React.CSSProperties
}): React.JSX.Element {
  const disabled = props.disabled === true
  return (
    <button
      type="button"
      className={props.className}
      title={props.label}
      aria-label={props.label}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={props.onClick}
    >
      <span className="maplibregl-ctrl-icon" aria-hidden="true" style={props.iconStyle} />
    </button>
  )
}

/** The center button's indicator shape. */
function NavigationIndicatorIcon (): React.JSX.Element {
  return (
    <svg width="33" height="30" viewBox="0 0 337 308" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M331.07 256.95L303.27 208.32L257.64 128.46L257.17 127.66L247.36 110.49L238.96 95.82L193.12 15.63C188.07 6.77001 178.34 1.04001 168.35 1.04001H167.34C157.39 1.04001 148.35 6.47001 143.17 15.55L88.8899 110.49L78.3499 128.9L78.2899 129.03L54.75 170.21L32.95 208.32L15.9899 238L5.21995 256.86C-0.290052 266.5 -0.670052 278.22 4.20995 288.19C9.87995 299.83 21.4299 307.06 34.3499 307.06H127.71C138 307.06 148.12 303.55 156.28 297.1L156.5 296.92C157.01 296.5 157.51 296.09 158.02 295.63C160.96 293.08 163.58 290.13 165.82 286.84L168.16 283.4L170.5 286.85C179.09 299.5 193.35 307.05 208.63 307.05H301.96C308.36 307.05 314.55 305.27 319.89 301.9L320.46 301.54L320.96 301.09C324.49 297.92 327.71 294.38 330.53 290.57L331.96 288.64L332.29 287.94C337 278 336.54 266.41 331.09 256.95H331.07ZM143.7 271.82C142.76 273.2 141.65 274.44 140.41 275.51L140.24 275.66C140.02 275.86 139.8 276.03 139.59 276.21C136.21 278.86 131.99 280.33 127.7 280.33H34.34C31.68 280.33 29.3999 278.89 28.2199 276.48C27.6299 275.27 26.8699 272.83 28.4199 270.12L39.1899 251.26L56.15 221.59L77.9499 183.48L101.86 141.65L101.92 141.53L112.09 123.76L166.38 28.8C166.83 28.02 167.27 27.78 167.33 27.76L167.83 27.8L168.35 27.77C168.67 27.77 169.51 28.17 169.91 28.88L215.76 109.09L224.16 123.76L234.06 141.09L234.48 141.79L280.07 221.58L307.31 269.24V277.71C306.06 279.37 304.13 280.32 301.94 280.32H208.61C202.18 280.32 196.19 277.15 192.59 271.84L168.13 235.78L143.69 271.82H143.7Z"
        fill="#000"
        stroke="#000"
      />
    </svg>
  )
}

const ZOOM_OUT_ICON = 'url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2229%22%20height%3D%2229%22%20fill%3D%22%23000%22%20viewBox%3D%220%200%2029%2029%22%3E%3Cpath%20d%3D%22M10%2013c-.75%200-1.5.75-1.5%201.5S9.25%2016%2010%2016h9c.75%200%201.5-.75%201.5-1.5S19.75%2013%2019%2013z%22%2F%3E%3C%2Fsvg%3E")'
const ZOOM_IN_ICON = 'url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2229%22%20height%3D%2229%22%20fill%3D%22%23000%22%20viewBox%3D%220%200%2029%2029%22%3E%3Cpath%20d%3D%22M14.5%208.5c-.75%200-1.5.75-1.5%201.5v3h-3c-.75%200-1.5.75-1.5%201.5S9.25%2016%2010%2016h3v3c0%20.75.75%201.5%201.5%201.5S16%2019.75%2016%2019v-3h3c.75%200%201.5-.75%201.5-1.5S19.75%2013%2019%2013h-3v-3c0-.75-.75-1.5-1.5-1.5%22%2F%3E%3C%2Fsvg%3E")'
const FULLSCREEN_ICON = 'url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2229%22%20height%3D%2229%22%20fill%3D%22%23000%22%20viewBox%3D%220%200%2029%2029%22%3E%3Cpath%20d%3D%22M24%2016v5.5c0%201.75-.75%202.5-2.5%202.5H16v-1l3-1.5-4-5.5%201-1%205.5%204%201.5-3zM6%2016l1.5%203%205.5-4%201%201-4%205.5%203%201.5v1H7.5C5.75%2024%205%2023.25%205%2021.5V16zm7-11v1l-3%201.5%204%205.5-1%201-5.5-4L6%2013H5V7.5C5%205.75%205.75%205%207.5%205zm11%202.5c0-1.75-.75-2.5-2.5-2.5H16v1l3%201.5-4%205.5%201%201%205.5-4%201.5%203h1z%22%2F%3E%3C%2Fsvg%3E")'
const SHRINK_ICON = 'url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2229%22%20height%3D%2229%22%20fill%3D%22%23000%22%20viewBox%3D%220%200%2029%2029%22%3E%3Cpath%20d%3D%22M18.5%2016c-1.75%200-2.5.75-2.5%202.5V24h1l1.5-3%205.5%204%201-1-4-5.5%203-1.5v-1zM13%2018.5c0-1.75-.75-2.5-2.5-2.5H5v1l3%201.5L4%2024l1%201%205.5-4%201.5%203h1zm3-8c0%201.75.75%202.5%202.5%202.5H24v-1l-3-1.5L25%205l-1-1-5.5%204L17%205h-1zM10.5%2013c1.75%200%202.5-.75%202.5-2.5V5h-1l-1.5%203L5%204%204%205l4%205.5L5%2012v1z%22%2F%3E%3C%2Fsvg%3E")'
const COMPASS_DARK_ICON = 'url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2229%22%20height%3D%2229%22%20fill%3D%22%23eef2f6%22%20viewBox%3D%220%200%2029%2029%22%3E%3Cpath%20d%3D%22m10.5%2014%204-8%204%208z%22%2F%3E%3Cpath%20fill%3D%22%238999aa%22%20d%3D%22m10.5%2016%204%208%204-8z%22%2F%3E%3C%2Fsvg%3E")'
const COMPASS_ICON ='url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2229%22%20height%3D%2229%22%20fill%3D%22%23333%22%20viewBox%3D%220%200%2029%2029%22%3E%3Cpath%20d%3D%22m10.5%2014%204-8%204%208z%22%2F%3E%3Cpath%20fill%3D%22%23ccc%22%20d%3D%22m10.5%2016%204%208%204-8z%22%2F%3E%3C%2Fsvg%3E")'

/**
 * Plain class names in a style element. Experience Builder's css-loader
 * hashes the class names of an imported stylesheet, so these rules would
 * match nothing from a .css file.
 */
const MAP_CONTROLS_CSS = `
.audiom-map-controls { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; color: #333; }
.audiom-map-controls--corner { position: absolute; top: 10px; right: 10px; z-index: 30; pointer-events: none; }
.audiom-map-controls .maplibregl-ctrl-group { pointer-events: auto; border-radius: 4px; background: #fff; color: #333; }
.audiom-map-controls .maplibregl-ctrl-group:not(:empty) { box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1); }
.audiom-map-controls .maplibregl-ctrl-group button {
  width: 29px; height: 29px; display: block; padding: 0; outline: none; border: 0;
  box-sizing: border-box; background-color: transparent; color: inherit; cursor: pointer;
}
.audiom-map-controls .maplibregl-ctrl-group button + button { border-top: 1px solid #ddd; }
.audiom-map-controls button .maplibregl-ctrl-icon {
  display: block; width: 100%; height: 100%; background-color: currentColor; background-image: none;
  background-repeat: no-repeat; background-position: 50%;
  -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
  -webkit-mask-position: center; mask-position: center;
  -webkit-mask-size: 29px 29px; mask-size: 29px 29px;
}
.audiom-map-controls button:disabled { cursor: not-allowed; }
.audiom-map-controls button:disabled .maplibregl-ctrl-icon { opacity: 0.25; }
@media (hover: hover) {
  .audiom-map-controls button:not(:disabled):hover { background-color: rgba(0, 0, 0, 0.05); }
}
.audiom-map-controls button:not(:disabled):active { background-color: rgba(0, 0, 0, 0.05); }
.audiom-map-controls button:focus:focus-visible { outline: none; box-shadow: 0 0 2px 2px #0096ff; }
.audiom-map-controls button.maplibregl-ctrl-zoom-out .maplibregl-ctrl-icon { -webkit-mask-image: ${ZOOM_OUT_ICON}; mask-image: ${ZOOM_OUT_ICON}; }
.audiom-map-controls button.maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon { -webkit-mask-image: ${ZOOM_IN_ICON}; mask-image: ${ZOOM_IN_ICON}; }
.audiom-map-controls button.maplibregl-ctrl-fullscreen .maplibregl-ctrl-icon { -webkit-mask-image: ${FULLSCREEN_ICON}; mask-image: ${FULLSCREEN_ICON}; }
.audiom-map-controls button.maplibregl-ctrl-shrink .maplibregl-ctrl-icon { -webkit-mask-image: ${SHRINK_ICON}; mask-image: ${SHRINK_ICON}; }
/* Compass stays a two-tone image. A mask would flatten the south triangle. */
.audiom-map-controls button.maplibregl-ctrl-compass .maplibregl-ctrl-icon {
  background-color: transparent; -webkit-mask-image: none; mask-image: none; background-image: ${COMPASS_ICON};
}
.audiom-map-controls .audiom-map-recenter { display: flex; align-items: center; justify-content: center; color: inherit; }
.audiom-map-controls .audiom-map-recenter svg { width: 1rem; height: 1rem; }
.audiom-map-controls .audiom-map-recenter svg path { fill: currentColor; stroke: currentColor; }
.audiom-map-controls[data-theme="dark"] { color: var(--control-text, #eef2f6); }
.audiom-map-controls[data-theme="dark"] .maplibregl-ctrl-group { background: var(--control-background, #04203e); color: var(--control-text, #eef2f6); }
.audiom-map-controls[data-theme="dark"] .maplibregl-ctrl-group:not(:empty) { box-shadow: 0 0 0 2px var(--control-border, #8999aa); }
.audiom-map-controls[data-theme="dark"] .maplibregl-ctrl-group button + button { border-top-color: var(--control-border, #8999aa); }
@media (hover: hover) {
  .audiom-map-controls[data-theme="dark"] button:not(:disabled):hover { background-color: var(--control-active-background, #e9eef4); color: var(--control-active-text, #04203e); }
}
.audiom-map-controls[data-theme="dark"] button:not(:disabled):active { background-color: var(--control-active-background, #e9eef4); color: var(--control-active-text, #04203e); }
.audiom-map-controls[data-theme="dark"] button.maplibregl-ctrl-compass .maplibregl-ctrl-icon { background-image: ${COMPASS_DARK_ICON}; }
.${PSEUDO_FULLSCREEN_CLASS} {
  position: fixed !important; inset: 0 !important; width: 100% !important; height: 100% !important; z-index: 10000 !important;
}
`
