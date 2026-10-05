import { React } from 'jimu-core'
import { render, fireEvent } from '@testing-library/react'
import { makeSource } from '../helpers/configFactories'
import SourceConfigList from '../../src/setting/components/SourceConfigList'

jest.mock('jimu-ui', () => {
  const { createJimuUiStubs } = require('../helpers/stubComponents')
  return createJimuUiStubs()
})

jest.mock('jimu-ui/advanced/setting-components', () => {
  const { createSettingComponentsStubs } = require('../helpers/stubComponents')
  return createSettingComponentsStubs()
})

jest.mock('jimu-icons/outlined/directional/expand', () => ({
  __esModule: true,
  ExpandOutlined: () => 'expand'
}))

jest.mock('jimu-icons/outlined/directional/collapse', () => ({
  __esModule: true,
  CollapseOutlined: () => 'collapse'
}))

jest.mock('../../src/setting/components/IconActionButton', () => {
  const { stubIconActionButton } = require('../helpers/stubComponents')
  return { __esModule: true, default: stubIconActionButton }
})

jest.mock('../../src/setting/components/CollapsibleHeader', () => {
  const { stubCollapsibleHeader } = require('../helpers/stubComponents')
  return { __esModule: true, default: stubCollapsibleHeader }
})

jest.mock('../../src/setting/components/SourceConfigCard', () => {
  const { stubSourceConfigCard } = require('../helpers/stubComponents')
  return { __esModule: true, default: stubSourceConfigCard }
})

jest.mock('../../src/setting/components/CopyableLabel', () => {
  const { stubCopyableLabel } = require('../helpers/stubComponents')
  return { __esModule: true, default: stubCopyableLabel }
})

describe('SourceConfigList', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })
  const sources = [
    makeSource({ source: 'a', name: 'Source A' }),
    makeSource({ source: 'b', name: 'Source B' })
  ]

  it('applies the chosen catalog URL to all sources, including map-synced sources', async () => {
    const url = 'https://audiom.example/rules/id/9.json?apiKey=pk_one'
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 9, name: 'OSM', slug: 'osm', url }] }) })
    const onChange = jest.fn()
    const view = render(<SourceConfigList sourceConfigs={sources} onChange={onChange} readOnly apiKey="pk_one" baseUrl="https://audiom.example" />)
    await view.findByRole('option', { name: 'OSM (#9)' })
    fireEvent.change(view.getByRole('combobox', { name: 'Rules File (All)' }), { target: { value: url } })
    expect(onChange).toHaveBeenCalledWith(sources.map(source => ({ ...source, rulesFileUrl: url })))
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('expands and collapses all sources via the 1.13 expand/collapse icons', () => {
    const { getByLabelText, getByTestId } = render(
      <SourceConfigList sourceConfigs={sources} onChange={() => undefined} />
    )
    const isExpanded = (index: number): boolean =>
      getByTestId(`source-card-${index}`).getAttribute('data-expanded') === 'true'

    expect(isExpanded(0)).toBe(true)
    expect(isExpanded(1)).toBe(true)

    fireEvent.click(getByLabelText('Collapse all sources'))
    expect(isExpanded(0)).toBe(false)
    expect(isExpanded(1)).toBe(false)

    fireEvent.click(getByLabelText('Expand all sources'))
    expect(isExpanded(0)).toBe(true)
    expect(isExpanded(1)).toBe(true)
  })
})
