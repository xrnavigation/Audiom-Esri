import { primeBundledAudio, startBundledRuntime, unlockBundledAudio } from '../../src/runtime/bundledRuntime'
import { setAudiomProgram, type AudiomProgram } from '../../src/runtime/audiomProgram'
import type { AvatarState } from '../../../../shared/audiom-runtime/src/types'
import { mapPointFromScreen, setMapModuleLoader, showAvatar, type MountedMapSurface } from '../../src/runtime/esriMapSurface'
import { createInProcessRuntime } from '../../../../shared/audiom-runtime/src/factory'

/** Stand-in for Audiom grid movement. Left and right slide sideways. */
function gridProgram (host: { onAvatarChanged: (state: AvatarState) => Promise<unknown> }): AudiomProgram {
  const state: AvatarState = {
    position: { longitude: 10, latitude: 20 },
    orientation: 0,
    visualState: 'grid'
  }
  const runtime = createInProcessRuntime({
    sessionId: 'grid',
    instanceId: 'grid',
    moveAvatar (direction: string) {
      if (direction === 'left') state.position.longitude -= 1
      if (direction === 'right') state.position.longitude += 1
      if (direction === 'up') state.position.latitude += 1
      if (direction === 'down') state.position.latitude -= 1
      return {
        position: { ...state.position },
        orientation: state.orientation,
        visualState: state.visualState
      }
    }
  }, host as never)
  return {
    runtime,
    avatarState: () => ({
      position: { ...state.position },
      orientation: state.orientation,
      visualState: state.visualState
    }),
    moveAvatar: (direction) => state,
    dispose () { void runtime.dispose() }
  }
}

describe('Audiom avatar', () => {
  afterEach(() => {
    setAudiomProgram(null)
    setMapModuleLoader(null)
  })

  it('slides sideways from Audiom and does not invent a marker', async () => {
    setMapModuleLoader(async () => [
      class Graphic { constructor (public props: unknown) {} },
      class Point { constructor (public props: unknown) {} }
    ])
    setAudiomProgram((_options, host) => gridProgram(host))
    const added: unknown[] = []
    const shared: unknown[] = []
    const surface = {
      view: {
        map: { layers: { add () {}, remove () {} } },
        graphics: {
          removeAll () { throw new Error('shared graphics must not be cleared') },
          add (graphic: unknown) { shared.push(graphic) }
        }
      },
      ownedMap: true,
      avatarLayer: {
        remove (graphic: unknown) {
          const index = added.indexOf(graphic)
          if (index >= 0) added.splice(index, 1)
        },
        add (graphic: unknown) { added.push(graphic) }
      }
    } as unknown as MountedMapSurface
    const handle = startBundledRuntime('widget-1', undefined, () => undefined, surface, {
      longitude: 10,
      latitude: 20
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(handle.reported).toBe(true)
    expect(handle.avatar?.position.longitude).toBe(10)
    expect(added).toHaveLength(0)
    expect(surface.avatar).toBeTruthy()
    await showAvatar(surface, null)
    expect(surface.avatar).toBeTruthy()

    await handle.runtime.moveAvatar('left')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(handle.avatar?.position.longitude).toBe(9)
    expect(handle.avatar?.position.latitude).toBe(20)
    expect(handle.avatar?.orientation).toBe(0)
    expect(added).toHaveLength(0)
    expect(shared).toHaveLength(0)
    await handle.runtime.dispose()
  })

  it('pans the map that exists when Go reports a position', async () => {
    setAudiomProgram((_options, host) => gridProgram(host))
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
    const handle = startBundledRuntime('widget-1', undefined, () => undefined, null)
    handle.bindSurface?.(surface)
    await new Promise((resolve) => setTimeout(resolve, 0))
    centers.length = 0

    await handle.runtime.notifyAvatarChanged({
      position: { longitude: -77.45, latitude: 38.77 },
      orientation: 0,
      visualState: 'grid'
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(centers).toEqual([{ center: [-77.45, 38.77] }])
    await handle.runtime.dispose()
  })

  it('drops the indicator only when Audiom accepts the point', async () => {
    const drops: Array<[number, number]> = []
    setAudiomProgram((_options, host) => {
      const program = gridProgram(host)
      program.dropAvatar = (longitude, latitude) => {
        drops.push([longitude, latitude])
        if (longitude < 0) return null
        return {
          position: { longitude, latitude },
          orientation: 90,
          visualState: 'grid'
        }
      }
      return program
    })
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
    const handle = startBundledRuntime('widget-1', undefined, () => undefined, surface)
    await new Promise((resolve) => setTimeout(resolve, 0))
    centers.length = 0

    await expect(handle.dropAvatar?.(-1, 5)).resolves.toBe(false)
    expect(handle.avatar?.position).toEqual({ longitude: 10, latitude: 20 })
    expect(centers).toEqual([])

    await expect(handle.dropAvatar?.(11, 21)).resolves.toBe(true)
    expect(handle.avatar?.position).toEqual({ longitude: 11, latitude: 21 })
    expect(handle.avatar?.orientation).toBe(90)
    expect(centers).toEqual([{ center: [11, 21] }])
    expect(drops).toEqual([[-1, 5], [11, 21]])
    await handle.runtime.dispose()
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

  it('treats a promised unlock as unlocked', async () => {
    let resumed = false
    const handle = startBundledRuntime('widget-unlock', undefined, () => undefined)
    handle.activationRequired = true
    handle.program = {
      runtime: handle.runtime,
      unlockAudio: () => Promise.resolve(true).then((ok) => {
        resumed = true
        return ok
      }),
      dispose () { /* the runtime below owns disposal */ }
    }

    await expect(unlockBundledAudio(handle)).resolves.toBe(true)
    expect(resumed).toBe(true)
    expect(handle.activationRequired).toBe(false)
    await handle.runtime.dispose()
  })

  it('starts the browser resume before the unlock promise', () => {
    const handle = startBundledRuntime('widget-prime', undefined, () => undefined)
    let primed = false
    handle.program = {
      runtime: handle.runtime,
      primeAudio () { primed = true },
      dispose () { /* the runtime below owns disposal */ }
    }

    primeBundledAudio(handle)
    expect(primed).toBe(true)
    primeBundledAudio(null)
    return handle.runtime.dispose()
  })
})
