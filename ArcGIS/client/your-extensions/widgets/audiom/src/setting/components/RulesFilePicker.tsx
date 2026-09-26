import { React } from 'jimu-core'
import type { RulesCatalog } from '../hooks/useRulesCatalog'
import CopyButton from './CopyButton'

interface Props {
  label: string
  value: string
  onChange: (url: string) => void
  catalog: RulesCatalog
}

export default function RulesFilePicker ({ label, value, onChange, catalog }: Props) {
  const selected = catalog.items.some(item => item.url === value) ? value : ''
  const message = catalog.status === 'idle' ? 'Enter your API key to list rules files.'
    : catalog.status === 'loading' ? 'Loading rules files…'
      : catalog.status === 'error' ? 'Could not load rules files. Check your API key and Audiom server URL.'
        : catalog.items.length === 0 ? 'No rules files are available for this API key.' : ''
  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      <label style={{ display: 'block' }}>
        {label}
        <select aria-label={label} style={{ width: '100%' }} value={selected}
          disabled={catalog.status !== 'ready' || catalog.items.length === 0}
          onChange={event => { onChange(event.target.value) }}>
          <option value="">Custom URL or default rules</option>
          {catalog.items.map(item => <option key={item.id} value={item.url}>{item.name} (#{item.id})</option>)}
        </select>
      </label>
      {message && <div role={catalog.status === 'error' ? 'alert' : 'status'}>{message}</div>}
      <CopyButton value={value} ariaLabel={`Copy ${label} URL to clipboard`} disabled={!value} />
      <label style={{ display: 'block' }}>
        {label} URL
        <input type="url" aria-label={`${label} URL`} style={{ width: '100%' }} value={value}
          placeholder="Enter rules file URL" onChange={event => { onChange(event.target.value) }} />
      </label>
    </div>
  )
}
