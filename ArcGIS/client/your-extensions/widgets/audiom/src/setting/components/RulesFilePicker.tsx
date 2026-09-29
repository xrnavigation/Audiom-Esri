import { React } from 'jimu-core'
import { Select, Option, TextInput } from 'jimu-ui'
import { SettingRow } from 'jimu-ui/advanced/setting-components'
import type { RulesCatalog } from '../hooks/useRulesCatalog'
import { AriaRole, FlowType, RulesCatalogStatus } from '../enums'
import {
  MIXED_VALUE_PLACEHOLDER,
  PLACEHOLDER_RULES_URL,
  RULES_CATALOG_EMPTY,
  RULES_CATALOG_ERROR,
  RULES_CATALOG_IDLE,
  RULES_CATALOG_LOADING,
  RULES_FILE_CUSTOM_URL,
  RULES_FILE_MIXED
} from '../strings'
import { validateUrl } from '../validation/validation'
import CopyableLabel from './CopyableLabel'

interface Props {
  /** Dropdown label, e.g. "Rules File (Tract)". */
  label: string
  /** Custom URL field label. Defaults to "${label} URL". */
  urlLabel?: string
  value: string
  onChange: (url: string) => void
  catalog: RulesCatalog
  /** Show the mixed-value dash instead of an empty custom URL. */
  mixed?: boolean
  /**
   * Bulk picker: the URL field stays editable while mixed and writes through
   * onUrlChange instead of replacing every source via onChange.
   */
  urlEditableWhenMixed?: boolean
  onUrlChange?: (url: string) => void
}

const styles = {
  // SettingRow only adds margin-top when one row follows another row.
  // This block is a wrapper, so it has to carry both gaps itself:
  // above (Source URL → Rules File) and below (Rules File → Source),
  // whether or not the custom URL row is shown.
  container: { width: '100%', minWidth: 0, marginTop: '1rem', marginBottom: '1rem' },
  // Cancel SettingRow's own top margin so it is not added on top of the container gap.
  row: { marginTop: 0 },
  field: { width: '100%' },
  message: { width: '100%', margin: 0 }
} as const satisfies Record<string, React.CSSProperties>

/**
 * Catalog dropdown plus a manual URL field.
 *
 * Native <select>/<input> stay white on EXB 1.20 (Calcite form controls).
 * Jimu Select and TextInput own the chrome, so these match Map Type and
 * the other setting fields on 1.13–1.20.
 */
export default function RulesFilePicker ({
  label, urlLabel = `${label} URL`, value, onChange, catalog, mixed = false,
  urlEditableWhenMixed = false, onUrlChange
}: Props) {
  const selected = mixed ? MIXED_VALUE_PLACEHOLDER
    : catalog.items.some(item => item.url === value) ? value : ''
  const catalogDisabled = catalog.status !== RulesCatalogStatus.Ready || catalog.items.length === 0
  const message = catalog.status === RulesCatalogStatus.Idle ? RULES_CATALOG_IDLE
    : catalog.status === RulesCatalogStatus.Loading ? RULES_CATALOG_LOADING
      : catalog.status === RulesCatalogStatus.Error ? RULES_CATALOG_ERROR
        : catalog.items.length === 0 ? RULES_CATALOG_EMPTY : ''
  // Mixed still shows the URL row so the dash is visible, same as other mixed fields.
  const showCustomUrl = mixed || selected === ''
  const urlLocked = mixed && !urlEditableWhenMixed
  const urlValue = mixed ? MIXED_VALUE_PLACEHOLDER : value

  return (
    <div style={styles.container}>
      <SettingRow flow={FlowType.Wrap} style={styles.row}>
        <CopyableLabel label={label} copyValue={mixed ? '' : value} showCopyButton={false} />
        <Select
          style={styles.field}
          aria-label={label}
          value={selected}
          disabled={catalogDisabled}
          onChange={event => { onChange(event.target.value) }}
        >
          {mixed && (
            <Option value={MIXED_VALUE_PLACEHOLDER} disabled style={{ fontStyle: 'italic' }}>{RULES_FILE_MIXED}</Option>
          )}
          <Option value="">{RULES_FILE_CUSTOM_URL}</Option>
          {catalog.items.map(item => (
            <Option key={item.id} value={item.url}>{item.name} (#{item.id})</Option>
          ))}
        </Select>
      </SettingRow>
      {message && (
        <div role={catalog.status === RulesCatalogStatus.Error ? AriaRole.Alert : AriaRole.Status} style={styles.message}>
          {message}
        </div>
      )}
      {showCustomUrl && (
        <SettingRow flow={FlowType.Wrap} style={{ marginTop: '1rem' }}>
          <CopyableLabel label={urlLabel} copyValue={urlLocked ? '' : value} showCopyButton={!urlLocked && Boolean(value)} />
          <TextInput
            style={styles.field}
            aria-label={urlLabel}
            value={urlValue}
            placeholder={urlLocked ? MIXED_VALUE_PLACEHOLDER : PLACEHOLDER_RULES_URL}
            disabled={urlLocked}
            checkValidityOnAccept={urlLocked ? undefined : (text) => validateUrl(String(text))}
            onChange={event => { (onUrlChange ?? onChange)(event.target.value) }}
          />
        </SettingRow>
      )}
    </div>
  )
}
