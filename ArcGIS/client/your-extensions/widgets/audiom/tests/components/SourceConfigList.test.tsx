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
  const sources = [
    makeSource({ source: 'a', name: 'Source A' }),
    makeSource({ source: 'b', name: 'Source B' })
  ]

  it('expands and collapses all sources via the 1.13 expand/collapse icons', () => {
    const { getByLabelText, getByTestId } = render(
      <SourceConfigList sourceConfigs={sources} onChange={() => undefined} />
    )

    expect(getByTestId('source-card-0').getAttribute('data-expanded')).toBe('true')
    expect(getByTestId('source-card-1').getAttribute('data-expanded')).toBe('true')

    fireEvent.click(getByLabelText('Collapse all sources'))
    expect(getByTestId('source-card-0').getAttribute('data-expanded')).toBe('false')
    expect(getByTestId('source-card-1').getAttribute('data-expanded')).toBe('false')

    fireEvent.click(getByLabelText('Expand all sources'))
    expect(getByTestId('source-card-0').getAttribute('data-expanded')).toBe('true')
    expect(getByTestId('source-card-1').getAttribute('data-expanded')).toBe('true')
  })
})
