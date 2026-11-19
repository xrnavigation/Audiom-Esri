/**
 * The widget as a host of the published runtime's contract.
 *
 * Jest cannot load @xrnavigation/audiom-runtime (its exports name only an
 * `import` condition), so the runtime is a stand-in that records every
 * message the widget sends and answers like the contract does.
 */
interface Call { method: string, message: { sessionId: string, hostViewGeneration: number, sequence: number, payload: Record<string, unknown> } }

interface FakeRuntime {
  calls: Call[]
  config: Record<string, unknown> & { options: Record<string, unknown> }
  host: Record<string, (message: unknown) => Promise<{ payload: unknown, sequence: number }>>
  answers: Record<string, unknown>
}

const runtimes: FakeRuntime[] = []

jest.mock('@xrnavigation/audiom-runtime/in-process', () => ({
  createInProcessRuntime: (config: FakeRuntime['config'], host: FakeRuntime['host']) => {
    const fake: FakeRuntime = { calls: [], config, host, answers: {} }
    runtimes.push(fake)
    const method = (name: string) => (message: Call['message']) => {
      fake.calls.push({ method: name, message })
      const answer = fake.answers[name]
      if (answer instanceof Error) return Promise.reject(answer)
      return Promise.resolve({ ...message, payload: answer ?? { status: 'applied' } })
    }
    return new Proxy({}, { get: (_target, name: string) => method(name) })
  }
}), { virtual: true })

jest.mock('@xrnavigation/audiom-runtime/labels', () => ({ labelStyle: (): null => null }), { virtual: true })

// eslint-disable-next-line import/first
import { startBundledRuntime } from '../../src/runtime/bundledRuntime'
// eslint-disable-next-line import/first
import { mapPointFromScreen, setMapModuleLoader, type MountedMapSurface } from '../../src/runtime/esriMapSurface'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function start (overrides: Record<string, unknown> = {}) {
  const statuses: string[] = []
  const handle = startBundledRuntime({
    instanceId: 'widget-1',
    container: document.createElement('div'),
    onStatus: (status) => statuses.push(status),
    start: { longitude: -117.2, latitude: 34.05 },
    stepSize: 2,
    assetBase: 'https://audiom.net',
    soundpackUrl: 'https://audiom.net/indoor',
    soundpackFallbackUrl: 'https://audiom.net/default',
    locale: 'pt-br',
    ...overrides
  })
  return { handle, statuses, runtime: runtimes[runtimes.length - 1] }
}

describe('Audiom widget as a runtime host', () => {
  beforeEach(() => { runtimes.length = 0 })
  afterEach(() => { setMapModuleLoader(null) })

  it('constructs the runtime with the overlay, the configured centre and the widget settings', () => {
    const container = document.createElement('div')
    const { runtime } = start({ container })
    expect(runtime.config.container).toBe(container)
    expect(runtime.config.start).toEqual([-117.2, 34.05])
    expect(runtime.config.sessionId).toBe('widget-1-session')
    expect(runtime.config.options).toEqual(expect.objectContaining({
      instanceId: 'widget-1',
      assetBase: 'https://audiom.net',
      soundpack: 'https://audiom.net/indoor',
      defaultSoundpack: 'https://audiom.net/default',
      customStepSize: 2,
      hideWelcome: true,
      locale: 'pt-BR'
    }))
    const translations = runtime.config.options.translationResources as Record<string, Record<string, unknown>>
    expect(Object.keys(translations).sort()).toEqual(['de', 'en', 'es', 'fr', 'hi', 'it', 'ko', 'nl', 'pt-BR', 'ru', 'zh'])
    expect(translations.en.mapViewer).toBeTruthy()
    expect(translations['pt-BR'].mapViewer).not.toEqual(translations.en.mapViewer)
  })

  it('uses the primary pack for cues when the chosen pack already is /default', () => {
    const { runtime } = start({ soundpackUrl: 'https://audiom.net/default', soundpackFallbackUrl: undefined })
    expect(runtime.config.options.defaultSoundpack).toBe('https://audiom.net/default')
  })

  it('says hello with contract 1.1 before the first snapshot, in increasing envelopes', async () => {
    const { handle, runtime } = start()
    await handle.replaceSources({
      sources: [{
        id: 'units', name: 'Units', geometryFamily: 'polygon', mapType: 'indoor', rulesRef: null,
        disposition: 'bound', recordCount: 0, status: { type: 'complete' }, records: []
      }],
      unavailable: ['units'],
      queriedLayers: []
    })
    expect(runtime.calls.map((call) => call.method)).toEqual(['hello', 'replaceSources', 'setEffectiveState'])
    expect(runtime.calls[0].message.payload).toEqual(expect.objectContaining({
      product: 'Experience Builder',
      contractVersion: '1.1'
    }))
    const sequences = runtime.calls.map((call) => call.message.sequence)
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b))
    expect(new Set(runtime.calls.map((call) => call.message.sessionId))).toEqual(new Set(['widget-1-session']))
    // The contract rejects any key besides `sources`.
    const replace = runtime.calls[1].message.payload
    expect(Object.keys(replace.snapshot as object)).toEqual(['sources'])
    expect(replace.stateRevision).toBe(1)
    expect(runtime.calls[2].message.payload).toEqual({
      state: { sources: [{ id: 'units', available: false, inScale: true }], floor: null, time: null },
      stateRevision: 1
    })
  })

  it('steps on an arrow key and reports a blocked step', async () => {
    const { handle, runtime } = start()
    runtime.answers.moveAvatar = { status: 'moved' }
    await expect(handle.move('left')).resolves.toBe(true)
    runtime.answers.moveAvatar = { status: 'blocked' }
    await expect(handle.move('up')).resolves.toBe(false)
    await expect(handle.move('sideways')).resolves.toBe(false)
    const moves = runtime.calls.filter((call) => call.method === 'moveAvatar').map((call) => call.message.payload)
    expect(moves).toEqual([
      { move: { type: 'step', direction: 'left' } },
      { move: { type: 'step', direction: 'up' } }
    ])
  })

  it('drops the indicator only when Audiom accepts the point', async () => {
    const { handle, runtime } = start()
    runtime.answers.moveAvatar = { status: 'blocked' }
    await expect(handle.drop(-1, 5)).resolves.toBe(false)
    runtime.answers.moveAvatar = { status: 'moved' }
    await expect(handle.drop(11, 21)).resolves.toBe(true)
    expect(runtime.calls.filter((call) => call.method === 'moveAvatar').map((call) => call.message.payload)).toEqual([
      { move: { type: 'drop', position: [-1, 5] } },
      { move: { type: 'drop', position: [11, 21] } }
    ])
  })

  it('places a typed centre with restoreAvatar, keeping the heading', async () => {
    const { handle, runtime } = start()
    await runtime.host.onAvatarChanged({
      sessionId: 'widget-1-session', hostViewGeneration: 0, sequence: 0,
      payload: { position: [1, 2], orientation: 90, visualState: null }
    })
    await handle.place(-77.45, 38.77)
    expect(runtime.calls.find((call) => call.method === 'restoreAvatar')?.message.payload).toEqual({
      position: [-77.45, 38.77],
      orientation: 90
    })
  })

  it('draws the reported avatar without recentering the map', async () => {
    setMapModuleLoader(async () => [
      class Graphic { constructor (public props: unknown) {} },
      class Point { constructor (public props: unknown) {} }
    ])
    const centers: unknown[] = []
    const surface = {
      view: {
        map: { layers: { add () {}, remove () {} } },
        goTo (target: unknown) {
          centers.push(target)
          return Promise.resolve()
        }
      },
      ownedMap: true
    } as unknown as MountedMapSurface
    const { handle, runtime } = start()
    handle.bindSurface(surface)
    const reported: unknown[] = []
    handle.onReported = (avatar) => reported.push(avatar)
    const result = await runtime.host.onAvatarChanged({
      sessionId: 'widget-1-session', hostViewGeneration: 0, sequence: 0,
      payload: { position: [-77.45, 38.77], orientation: 45, visualState: null }
    })
    await flush()
    expect(result.payload).toEqual({ status: 'applied' })
    expect(handle.avatar).toEqual({ longitude: -77.45, latitude: 38.77, heading: 45 })
    expect(reported).toEqual([{ longitude: -77.45, latitude: 38.77, heading: 45 }])
    expect(surface.avatar).toBeTruthy()
    expect(centers).toEqual([])
  })

  it('starts the audio resume inside the gesture and answers false while the browser keeps it locked', async () => {
    const { handle, runtime } = start()
    handle.activationRequired = true
    runtime.answers.resumeAudio = new Error('activationRequired')
    const pending = handle.resumeAudio()
    // Called before any await: the gesture still counts.
    expect(runtime.calls.map((call) => call.method)).toContain('resumeAudio')
    await expect(pending).resolves.toBe(false)
    expect(handle.activationRequired).toBe(true)
    runtime.answers.resumeAudio = { status: 'applied' }
    await expect(handle.resumeAudio()).resolves.toBe(true)
    expect(handle.activationRequired).toBe(false)
  })

  it('tells the user to select the map when the runtime asks for audio activation', async () => {
    const { handle, runtime, statuses } = start()
    await runtime.host.onActivationRequired({
      sessionId: 'widget-1-session', hostViewGeneration: 0, sequence: 0, payload: { kind: 'audio' }
    })
    expect(handle.activationRequired).toBe(true)
    expect(statuses).toContain('Select the map to turn sound on')
  })

  it('follows the legend style the runtime reports', async () => {
    const { handle, runtime } = start()
    const styles: unknown[] = []
    handle.onStyle = (style) => styles.push(style)
    await runtime.host.onStyleChanged({
      sessionId: 'widget-1-session', hostViewGeneration: 0, sequence: 0,
      payload: { statistic: { field: 'pop', label: 'Population' }, styleMode: 'patterns', labels: false, floor: 2, hiddenSources: ['sites'] }
    })
    expect(handle.style).toEqual({
      statistic: { field: 'pop', label: 'Population' }, styleMode: 'patterns', labels: false, floor: 2, hiddenSources: ['sites']
    })
    expect(styles).toHaveLength(1)
  })

  it('reads the tooltip from describePoint and rule outputs from evaluateRecords', async () => {
    const { handle, runtime } = start()
    runtime.answers.describePoint = {
      features: [{ key: null, name: 'Tract 2', statistic: { field: 'pop', label: 'Population', value: 41 } }]
    }
    await expect(handle.describePoint(-117.2, 34.05)).resolves.toEqual([
      { name: 'Tract 2', statistic: { field: 'pop', label: 'Population', value: 41 } }
    ])
    runtime.answers.evaluateRecords = { outputs: [{ fill: '#fff' }, null] }
    await expect(handle.evaluate('https://audiom.net/rules/r.json', 'indoor', [
      { USE_TYPE: 'Office', skipped: undefined, bad: Number.NaN },
      { USE_TYPE: 'Level' }
    ])).resolves.toEqual([{ fill: '#fff' }, null])
    const evaluate = runtime.calls.find((call) => call.method === 'evaluateRecords')?.message.payload
    expect(evaluate?.rulesRef).toEqual({ type: 'url', url: 'https://audiom.net/rules/r.json' })
    expect(evaluate?.mapType).toBe('indoor')
    expect((evaluate?.records as Array<{ attributes: unknown }>)[0].attributes).toEqual({ USE_TYPE: 'Office' })
  })

  it('sets the step size and fence, and destroys the viewer on dispose', async () => {
    const { handle, runtime } = start()
    await handle.setStepSize(3)
    await handle.setNavigationExtent([-1, -2, 3, 4])
    await handle.dispose()
    expect(runtime.calls.slice(1).map((call) => [call.method, call.message.payload])).toEqual([
      ['setStepSize', { meters: 3 }],
      ['setNavigationExtent', { extent: [-1, -2, 3, 4] }],
      ['setHostLifecycle', { widgetState: 'destroyed', viewState: 'inactive', authState: 'anonymous' }]
    ])
  })

  it('converts an overlay screen point back into the view before asking Esri', () => {
    const asked: Array<{ x: number, y: number }> = []
    const surface = {
      view: {
        container: {
          parentElement: {},
          getBoundingClientRect: () => ({ left: 20, top: 30, width: 100, height: 100 })
        },
        toMap (point: { x: number, y: number }) {
          asked.push(point)
          return { longitude: point.x, latitude: point.y }
        }
      }
    } as unknown as MountedMapSurface
    const parent = surface.view.container?.parentElement as { getBoundingClientRect?: () => { left: number, top: number } }
    parent.getBoundingClientRect = () => ({ left: 0, top: 0 })

    expect(mapPointFromScreen(surface, { x: 50, y: 70 })).toEqual({
      longitude: 30,
      latitude: 40
    })
    expect(asked).toEqual([{ x: 30, y: 40 }])
    expect(mapPointFromScreen(null, { x: 1, y: 1 })).toBeNull()
  })
})
