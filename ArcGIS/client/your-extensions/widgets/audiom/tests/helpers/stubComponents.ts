/**
 * Minimal typed stand-ins for jimu-ui / setting-components / local widgets.
 *
 * jest.mock factories are hoisted, so call these via require():
 *   const { createJimuUiStubs } = require('../helpers/stubComponents')
 *
 * Do not import jimu-core/jimu-ui at module scope — that creates a cycle
 * with hoisted jest.mock('jimu-ui') factories and leaves named exports
 * undefined. Require React only when a stub renders.
 *
 * Do not import Jimu's real prop types here — they are large and version-skewed.
 */
import type {
  CSSProperties,
  ChangeEvent,
  ChangeEventHandler,
  MouseEventHandler,
  ReactElement,
  ReactNode
} from 'react'

type ReactNS = typeof import('jimu-core').React

function getReact(): ReactNS {
  return require('jimu-core').React
}

export interface ChildrenProps {
  children?: ReactNode
}

export interface ButtonStubProps extends ChildrenProps {
  onClick?: MouseEventHandler
  type?: string
  htmlType?: string
  style?: CSSProperties
  'aria-expanded'?: boolean | string
  'aria-controls'?: string
  'aria-label'?: string
}

export interface SelectStubProps extends ChildrenProps {
  value?: string | number
  onChange?: ChangeEventHandler<HTMLSelectElement>
}

export interface OptionStubProps extends ChildrenProps {
  value?: string | number
}

export interface CollapseStubProps extends ChildrenProps {
  isOpen?: boolean
}

export interface TextInputStubProps {
  value?: string | number
  onChange?: ChangeEventHandler<HTMLInputElement>
}

export interface SwitchStubProps {
  checked?: boolean
  onChange?: ChangeEventHandler<HTMLInputElement>
}

export interface NumericInputStubProps {
  value?: string | number
  onChange?: (value: string) => void
}

export interface MapWidgetSelectorStubProps {
  onSelect?: (ids: string[]) => void
}

export interface IconActionButtonStubProps extends ChildrenProps {
  ariaLabel?: string
  tooltip?: string
  onClick?: MouseEventHandler
}

export interface CollapsibleHeaderStubProps extends ChildrenProps {
  label?: string
  actions?: ReactNode
}

export interface SourceConfigCardStubProps {
  index: number
  isExpanded?: boolean
  sourceConfig?: { name?: string }
}

export interface CopyableLabelStubProps {
  label?: string
}

export function passthroughDiv(p: ChildrenProps): ReactElement {
  const React = getReact()
  return React.createElement('div', null, p.children)
}

export function passthroughChildren(p: ChildrenProps): ReactNode {
  return p.children ?? null
}

export function stubButton(p: ButtonStubProps): ReactElement {
  const React = getReact()
  return React.createElement('button', {
    type: p.htmlType ?? 'button',
    onClick: p.onClick,
    style: p.style,
    'data-button-type': p.type,
    'aria-expanded': p['aria-expanded'],
    'aria-controls': p['aria-controls'],
    'aria-label': p['aria-label']
  }, p.children)
}

export function stubSelect(p: SelectStubProps): ReactElement {
  const React = getReact()
  return React.createElement('select', {
    value: p.value,
    onChange: p.onChange
  }, p.children)
}

export function stubOption(p: OptionStubProps): ReactElement {
  const React = getReact()
  return React.createElement('option', { value: p.value }, p.children)
}

export function stubCollapse(p: CollapseStubProps): ReactElement {
  const React = getReact()
  return React.createElement('div', null, p.isOpen ? p.children : null)
}

export function stubTextInput(p: TextInputStubProps): ReactElement {
  const React = getReact()
  return React.createElement('input', {
    value: p.value ?? '',
    onChange: p.onChange
  })
}

export function stubSwitch(p: SwitchStubProps): ReactElement {
  const React = getReact()
  return React.createElement('input', {
    type: 'checkbox',
    checked: !!p.checked,
    onChange: p.onChange
  })
}

export function stubNumericInput(p: NumericInputStubProps): ReactElement {
  const React = getReact()
  return React.createElement('input', {
    value: p.value ?? '',
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      p.onChange?.(event.target.value)
    }
  })
}

export function stubMapWidgetSelector(p: MapWidgetSelectorStubProps): ReactElement {
  const React = getReact()
  return React.createElement('div', {
    'data-testid': 'map-widget-selector',
    onClick: () => p.onSelect?.(['picked-map'])
  })
}

export function stubIconActionButton(p: IconActionButtonStubProps): ReactElement {
  const React = getReact()
  return React.createElement('button', {
    type: 'button',
    'aria-label': p.ariaLabel ?? p.tooltip,
    onClick: p.onClick
  }, p.children)
}

export function stubCollapsibleHeader(p: CollapsibleHeaderStubProps): ReactElement {
  const React = getReact()
  return React.createElement('div', null, p.label, p.actions)
}

export function stubSourceConfigCard(p: SourceConfigCardStubProps): ReactElement {
  const React = getReact()
  return React.createElement('div', {
    'data-testid': `source-card-${p.index}`,
    'data-expanded': p.isExpanded ? 'true' : 'false'
  }, p.sourceConfig?.name)
}

export function stubCopyableLabel(p: CopyableLabelStubProps): ReactElement {
  const React = getReact()
  return React.createElement('span', null, p.label)
}

export function createJimuUiStubs(): {
  __esModule: true
  Select: typeof stubSelect
  Option: typeof stubOption
  Collapse: typeof stubCollapse
  Button: typeof stubButton
  TextInput: typeof stubTextInput
  NumericInput: typeof stubNumericInput
  Switch: typeof stubSwitch
  ButtonGroup: typeof passthroughDiv
  Tooltip: typeof passthroughChildren
  Label: typeof passthroughDiv
} {
  return {
    __esModule: true,
    Select: stubSelect,
    Option: stubOption,
    Collapse: stubCollapse,
    Button: stubButton,
    TextInput: stubTextInput,
    NumericInput: stubNumericInput,
    Switch: stubSwitch,
    ButtonGroup: passthroughDiv,
    Tooltip: passthroughChildren,
    Label: passthroughDiv
  }
}

export function createSettingComponentsStubs(): {
  __esModule: true
  MapWidgetSelector: typeof stubMapWidgetSelector
  SettingSection: typeof passthroughDiv
  SettingRow: typeof passthroughDiv
} {
  return {
    __esModule: true,
    MapWidgetSelector: stubMapWidgetSelector,
    SettingSection: passthroughDiv,
    SettingRow: passthroughDiv
  }
}
