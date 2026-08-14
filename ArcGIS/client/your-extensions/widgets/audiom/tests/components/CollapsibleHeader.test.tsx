import { React } from 'jimu-core'
import { render, fireEvent } from '@testing-library/react'
import CollapsibleHeader from '../../src/setting/components/CollapsibleHeader'

jest.mock('jimu-ui', () => {
  const React = require('jimu-core').React
  return {
    __esModule: true,
    Button: (p: any) => React.createElement('button', {
      type: p.htmlType ?? 'button',
      onClick: p.onClick,
      style: p.style,
      'data-button-type': p.type,
      'data-unstyled': p.unstyled ? 'true' : undefined,
      'aria-expanded': p['aria-expanded'],
      'aria-controls': p['aria-controls'],
      'aria-label': p['aria-label']
    }, p.children),
    Tooltip: (p: { children?: unknown }) => p.children ?? null
  }
})

jest.mock('jimu-icons/outlined/directional/down', () => ({
  __esModule: true,
  DownOutlined: () => 'down'
}))

jest.mock('jimu-icons/outlined/directional/right', () => ({
  __esModule: true,
  RightOutlined: () => 'right'
}))

describe('CollapsibleHeader', () => {
  it('keeps the chevron beside the label and strips default button chrome', () => {
    const { getByRole } = render(
      <CollapsibleHeader label="Visual Base Layers" isOpen={false} onToggle={() => undefined} />
    )

    const button = getByRole('button') as HTMLButtonElement
    expect(button.getAttribute('data-button-type')).toBe('tertiary')
    expect(button.getAttribute('data-unstyled')).toBe('true')
    expect(button.style.display).toBe('flex')
    expect(button.style.flexDirection).toBe('row')
    expect(button.style.alignItems).toBe('center')
    expect(button.style.background).toBe('transparent')
    expect(button.style.backgroundColor).toBe('transparent')
    expect(button.style.boxShadow).toBe('none')
    expect(button.style.padding).toBe('0px')
    expect(button.style.margin).toBe('0px')

    const icon = button.firstElementChild as HTMLElement
    const label = button.lastElementChild as HTMLElement
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(label.textContent).toBe('Visual Base Layers')
    expect(icon.nextElementSibling).toBe(label)
  })

  it('toggles when the header is clicked', () => {
    const onToggle = jest.fn()
    const { getByRole } = render(
      <CollapsibleHeader label="Map Settings" isOpen={true} onToggle={onToggle} />
    )

    fireEvent.click(getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(getByRole('button').getAttribute('aria-expanded')).toBe('true')
  })
})
