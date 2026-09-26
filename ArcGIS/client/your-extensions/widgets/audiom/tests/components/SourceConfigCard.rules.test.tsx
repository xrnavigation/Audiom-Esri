import { React } from 'jimu-core'
import { render, fireEvent } from '@testing-library/react'
import SourceConfigCard from '../../src/setting/components/SourceConfigCard'
import { makeSource } from '../helpers/configFactories'

jest.mock('jimu-ui', () => {
  const { createJimuUiStubs, passthroughChildren } = require('../helpers/stubComponents')
  return { ...createJimuUiStubs(), Card: passthroughChildren, ButtonGroup: passthroughChildren }
})
jest.mock('jimu-ui/advanced/setting-components', () => {
  const { createSettingComponentsStubs } = require('../helpers/stubComponents')
  return createSettingComponentsStubs()
})

describe('Source card rules selection', () => {
  it('updates only the source rules URL even when the map source is locked', () => {
    const onFieldChange = jest.fn()
    const url = 'https://audiom.example/rules/id/9.json?apiKey=pk_one'
    const view = render(<SourceConfigCard
      sourceConfig={makeSource({ name: 'Roads', locked: true })} index={0} isExpanded readOnly
      onFieldChange={onFieldChange} onToggleExpanded={jest.fn()} onRemove={jest.fn()}
      onToggleEnabled={jest.fn()} onToggleLocked={jest.fn()}
      catalog={{ status: 'ready', items: [{ id: 9, name: 'OSM', slug: 'osm', url }] }}
    />)
    fireEvent.change(view.getByRole('combobox', { name: /Roads/ }), { target: { value: url } })
    expect(onFieldChange).toHaveBeenCalledWith({ rulesFileUrl: url })
  })
})
