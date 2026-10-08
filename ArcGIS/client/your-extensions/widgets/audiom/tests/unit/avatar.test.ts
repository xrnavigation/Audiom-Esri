import { startBundledRuntime } from '../../src/runtime/bundledRuntime'
import { setAudiomProgram, type AudiomProgram } from '../../src/runtime/audiomProgram'
import type { AvatarState } from '../../../../shared/audiom-runtime/src/types'
import { setMapModuleLoader, showAvatar, type MountedMapSurface } from '../../src/runtime/esriMapSurface'
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
})
