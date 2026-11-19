import {
  type EsriFloorLayer,
  type EsriFloorView,
  featureIsClickable,
  guardFloorClicks,
  onEsriLayerChange,
  reapplyFloorFilters,
  setEsriFloor,
  setEsriLayerVisible,
  withoutFloorFilter
} from '../../src/runtime/esriLayerSync'

const LEVEL_1 = '{AAA-LEVEL-1}'
const LEVEL_2 = '{BBB-LEVEL-2}'

function catalog (rows: Array<Record<string, unknown>>): EsriFloorLayer {
  return {
    id: 'Levels',
    title: 'Levels',
    fields: [{ name: 'LEVEL_ID' }, { name: 'VERTICAL_ORDER' }, { name: 'NAME' }],
    createQuery: () => ({ where: "LEVEL_ID = '{stale}'" }),
    queryFeatures: async (query) => {
      const where = (query as { where?: string }).where || ''
      if (where === '1=1') return { features: rows.map((attributes) => ({ attributes })) }
      const match = /=\s*(-?\d+)/.exec(where)
      const ordinal = match ? Number(match[1]) : null
      return {
        features: rows
          .filter((row) => ordinal == null || row.VERTICAL_ORDER === ordinal)
          .map((attributes) => ({ attributes }))
      }
    }
  }
}

function featureLayer (
  id: string,
  fields: string[],
  base?: string
): EsriFloorLayer & { refreshes: number } {
  return {
    id,
    title: id,
    fields: fields.map((name) => ({ name })),
    definitionExpression: base,
    refreshes: 0,
    setDefinitionExpression (expression: string | null) {
      this.definitionExpression = expression ?? undefined
    },
    refresh () {
      this.refreshes += 1
    }
  }
}

function viewOf (layers: EsriFloorLayer[]): EsriFloorView & { filters: Map<string, string | null> } {
  const filters = new Map<string, string | null>()
  return {
    filters,
    map: {
      allLayers: {
        forEach (fn) {
          for (const layer of layers) fn(layer)
        }
      }
    },
    whenLayerView: async (layer) => ({
      set filter (value: { where?: string } | null) {
        filters.set(layer.id || '', value?.where ?? null)
      }
    })
  }
}

describe('withoutFloorFilter', () => {
  const level1 = '{BAE9BBC5-D74F-4B7A-9904-9763AE70CCF2}'

  it('drops only the field the map uses to pick a floor', () => {
    expect(withoutFloorFilter(`LEVEL_ID = '${level1}'`)).toBe(`LEVEL_ID = '${level1}'`)
    expect(withoutFloorFilter("FLOOR_CODE = 'A'", ['FLOOR_CODE'])).toBeNull()
    expect(withoutFloorFilter(`(USE_TYPE <> 'Level') AND (LEVEL_ID = '${level1}')`, ['LEVEL_ID']))
      .toBe("(USE_TYPE <> 'Level')")
    expect(withoutFloorFilter('STATUS = 1', ['FLOOR_CODE'])).toBe('STATUS = 1')
  })
})

describe('Esri floor filter', () => {
  it('shows Level 1 on LEVEL_ID layers and leaves the basemap alone', async () => {
    const levels = catalog([
      { LEVEL_ID: LEVEL_1, VERTICAL_ORDER: 0, NAME: 'Level 1' },
      { LEVEL_ID: LEVEL_2, VERTICAL_ORDER: 1, NAME: 'Level 2' }
    ])
    levels.definitionExpression = `LEVEL_ID = '${LEVEL_1}'`
    const units = featureLayer('Units', ['LEVEL_ID', 'NAME'], "USE_TYPE <> 'Level'")
    const sites = featureLayer('Sites', ['NAME'])
    const view = viewOf([levels, units, sites])

    expect(await setEsriFloor(view, 0)).toBe(2)
    expect(units.definitionExpression).toBe("USE_TYPE <> 'Level'")
    expect(levels.definitionExpression == null).toBe(true)
    expect(sites.definitionExpression).toBeUndefined()
    expect(view.filters.get('Units')).toBe(`LEVEL_ID = '${LEVEL_1}'`)
    expect(units.refreshes).toBe(0)
  })

  it('switches floors without wrapping the original expression twice', async () => {
    const levels = catalog([
      { LEVEL_ID: LEVEL_1, VERTICAL_ORDER: 0 },
      { LEVEL_ID: LEVEL_2, VERTICAL_ORDER: 1 }
    ])
    // The published web map pins Level 1. A query for Level 2 must not
    // still be ANDed with that clause.
    levels.definitionExpression = `LEVEL_ID = '${LEVEL_1}'`
    const queryFeatures = levels.queryFeatures?.bind(levels)
    levels.queryFeatures = async (query) => {
      const where = (query as { where?: string }).where || ''
      if (where.includes('= 1') && String(levels.definitionExpression || '').includes(LEVEL_1)) {
        return { features: [] }
      }
      return (await queryFeatures?.(query)) || { features: [] }
    }
    const units = featureLayer('Units', ['LEVEL_ID'], 'STATUS = 1')
    const view = viewOf([levels, units])

    await setEsriFloor(view, 0)
    await setEsriFloor(view, 1)
    expect(units.definitionExpression).toBe('STATUS = 1')
    expect(view.filters.get('Units')).toContain(LEVEL_2)
    expect(view.filters.get('Units')).not.toContain(LEVEL_1)

    await setEsriFloor(view, null)
    expect(units.definitionExpression).toBe('STATUS = 1')
    expect(view.filters.get('Units')).toBeNull()
  })

  it('ignores a stale floor query that resolves after a newer choice', async () => {
    let releaseFirst: (value: { features: Array<{ attributes: Record<string, unknown> }> }) => void = () => undefined
    let calls = 0
    const levels: EsriFloorLayer = {
      id: 'Levels',
      fields: [{ name: 'LEVEL_ID' }, { name: 'VERTICAL_ORDER' }],
      definitionExpression: `LEVEL_ID = '${LEVEL_1}'`,
      createQuery: () => ({}),
      queryFeatures: () => {
        calls += 1
        if (calls === 1) {
          return new Promise((resolve) => { releaseFirst = resolve })
        }
        return Promise.resolve({
          features: [
            { attributes: { LEVEL_ID: LEVEL_1, VERTICAL_ORDER: 0 } },
            { attributes: { LEVEL_ID: LEVEL_2, VERTICAL_ORDER: 1 } }
          ]
        })
      }
    }
    const units = featureLayer('Units', ['LEVEL_ID'])
    const view = viewOf([levels, units])
    const first = setEsriFloor(view, 0)
    await setEsriFloor(view, 1)
    releaseFirst({ features: [{ attributes: { LEVEL_ID: LEVEL_1, VERTICAL_ORDER: 0 } }] })
    await first
    expect(units.definitionExpression).toBeUndefined()
    expect(view.filters.get('Units')).toContain(LEVEL_2)
  })

  it('rewrites whatever field the map already filters, not a fixed indoor column', async () => {
    const levels: EsriFloorLayer = {
      id: 'Floors',
      fields: [{ name: 'FLOOR_CODE' }, { name: 'SORT_INDEX' }],
      definitionExpression: "FLOOR_CODE = 'A'",
      createQuery: () => ({}),
      queryFeatures: async () => ({
        features: [
          { attributes: { FLOOR_CODE: 'A', SORT_INDEX: 0 } },
          { attributes: { FLOOR_CODE: 'B', SORT_INDEX: 1 } }
        ]
      })
    }
    const rooms = featureLayer('Rooms', ['FLOOR_CODE', 'NAME'], 'STATUS = 1')
    const view = viewOf([levels, rooms])
    expect(await setEsriFloor(view, 1)).toBe(2)
    expect(view.filters.get('Rooms')).toBe("FLOOR_CODE = 'B'")
    expect(rooms.definitionExpression).toBe('STATUS = 1')
    expect(levels.definitionExpression == null).toBe(true)
  })

  it('keeps a shared State filter instead of treating it as a floor', async () => {
    const queryFeatures = jest.fn(async () => ({
      features: [
        { attributes: { State: 'Hawaii', OBJECTID: 1, POP: 10 } },
        { attributes: { State: 'Hawaii', OBJECTID: 2, POP: 0 } }
      ]
    }))
    const tract = featureLayer('Tract', ['State', 'OBJECTID', 'POP'], "State = 'Hawaii'")
    tract.createQuery = () => ({ where: "State = 'Hawaii'" })
    tract.queryFeatures = queryFeatures
    const county = featureLayer('County', ['State', 'NAME'], "State = 'Hawaii'")
    county.createQuery = () => ({})
    county.queryFeatures = queryFeatures
    const state = featureLayer('State', ['NAME'], "NAME = 'Hawaii'")
    const view = viewOf([tract, county, state])

    expect(await setEsriFloor(view, 0)).toBe(0)
    expect(tract.definitionExpression).toBe("State = 'Hawaii'")
    expect(county.definitionExpression).toBe("State = 'Hawaii'")
    expect(state.definitionExpression).toBe("NAME = 'Hawaii'")
    expect(queryFeatures).not.toHaveBeenCalled()
    expect(view.filters.get('Tract')).toBeUndefined()
  })

  it('does nothing when the level catalog is not queryable yet', async () => {
    const units = featureLayer('Units', ['LEVEL_ID'])
    const view = viewOf([units])
    expect(await setEsriFloor(view, 0)).toBe(0)
    expect(units.definitionExpression).toBeUndefined()
    expect(units.refreshes).toBe(0)
  })

  it('does not let a click select or reveal a hidden floor', async () => {
    const levels = catalog([
      { LEVEL_ID: LEVEL_1, VERTICAL_ORDER: 0, NAME: 'Level 1' },
      { LEVEL_ID: LEVEL_2, VERTICAL_ORDER: 1, NAME: 'Level 3' }
    ])
    levels.definitionExpression = `LEVEL_ID = '${LEVEL_1}'`
    const units = featureLayer('Units', ['LEVEL_ID'], "USE_TYPE <> 'Level'")
    const view = viewOf([levels, units])
    await setEsriFloor(view, 0)
    view.filters.set('Units', null)

    await reapplyFloorFilters(view)
    expect(view.filters.get('Units')).toBe(`LEVEL_ID = '${LEVEL_1}'`)
    expect(featureIsClickable({ attributes: { LEVEL_ID: LEVEL_2 }, layer: units }, view)).toBe(false)
    expect(featureIsClickable({ attributes: { LEVEL_ID: LEVEL_1 }, layer: units }, view)).toBe(true)

    view.hitTest = jest.fn(async () => ({
      results: [
        { graphic: { attributes: { LEVEL_ID: LEVEL_2 }, layer: units } },
        { graphic: { attributes: { LEVEL_ID: LEVEL_1 }, layer: units } }
      ]
    }))
    const stop = guardFloorClicks(view)
    const hit = await view.hitTest?.({ x: 1, y: 1 })
    stop()
    expect(hit?.results?.map((result) => result.graphic?.attributes?.LEVEL_ID)).toEqual([LEVEL_1])
  })

  it('keeps a hidden source hidden and unclickable when a click shows it', () => {
    const units = featureLayer('Units', ['LEVEL_ID'])
    units.visible = true
    const watches: Array<() => void> = []
    ;(units as EsriFloorLayer & { watch?: (name: string, cb: () => void) => void }).watch = (_name, cb) => {
      watches.push(cb)
    }
    const view = viewOf([units])
    expect(setEsriLayerVisible(view.map, 'Units', false)).toBe(1)
    units.visible = true
    for (const cb of watches) cb()
    expect(units.visible).toBe(false)
    expect(featureIsClickable({ attributes: { LEVEL_ID: LEVEL_1 }, layer: units }, view)).toBe(false)
  })
})

describe('onEsriLayerChange', () => {
  it('reapplies when the layer collection changes', () => {
    const listener = jest.fn()
    let changed: (() => void) | undefined
    const view = {
      map: {
        allLayers: {
          forEach () {
            // The change listener does not enumerate layers.
          },
          on (_event: string, cb: () => void) {
            changed = cb
            return { remove () { changed = undefined } }
          }
        }
      }
    }
    const stop = onEsriLayerChange(view, listener)
    changed?.()
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
    changed?.()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
