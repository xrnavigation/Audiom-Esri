import { React, css } from 'jimu-core'
import { Card, Collapse, Button, Tooltip, TextInput } from 'jimu-ui'
import { SettingRow } from 'jimu-ui/advanced/setting-components'
import { VisibleOutlined } from 'jimu-icons/outlined/application/visible'
import { InvisibleOutlined } from 'jimu-icons/outlined/application/invisible'
import { LockOutlined } from 'jimu-icons/outlined/editor/lock'
import { UnlockOutlined } from 'jimu-icons/outlined/editor/unlock'
import { TrashOutlined } from 'jimu-icons/outlined/editor/trash'
import { CopyOutlined } from 'jimu-icons/outlined/editor/copy'
import { PlusOutlined } from 'jimu-icons/outlined/editor/plus'
import { MapType } from '../../../../../shared/audiom-client/AudiomSource'
import { DEFAULT_SOURCE_CONFIG, DEFAULT_FILTER_CONFIG, FieldConfig, ISourceConfig, IFilterConfig } from '../configs'
import { ButtonSize, ButtonType, FieldType, FlowType, Colors, MAP_TYPE_OPTIONS } from '../enums'
import { SourceConfigKey } from '../configKeys'
import { validateUrl } from '../validation/validation'
import { useCopyToClipboard, TOOLTIP_COPY, TOOLTIP_COPIED } from '../useCopyToClipboard'
import CollapsibleHeader, { CollapsibleHeaderLevel } from './CollapsibleHeader'
import CopyableLabel from './CopyableLabel'
import FieldRenderer from './FieldRenderer'

// Typed styles with full key/value validation
const styles = {
  card: {
    marginBottom: 12,
    border: 0
  },
  content: { padding: 12 },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 4
  },
  filtersHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%'
  },
  filtersHeaderActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 2
  },
  filterItem: {
    width: '100%',
    marginBottom: 8
  },
  filterToolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    marginBottom: 2
  }
} as const satisfies Record<string, React.CSSProperties>

const filterActionButtonStyle = css({
  padding: 2,
  minWidth: 20,
  minHeight: 20,
  '& svg': {
    width: 12,
    height: 12
  }
})

const filterActionDisabledStyle = css({
  padding: 2,
  minWidth: 20,
  minHeight: 20,
  opacity: 0.3,
  cursor: 'not-allowed',
  '& svg': {
    width: 12,
    height: 12
  }
})

/** Copy button style matching CopyableLabel's native button */
const filterCopyButtonStyle = css({
  padding: 2,
  background: Colors.Transparent,
  border: 'none',
  cursor: 'pointer',
  color: Colors.TextMuted,
  opacity: 0.6,
  transition: 'opacity 0.15s ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '&:hover': {
    opacity: 1
  },
  '&:focus-visible': {
    outline: `2px solid ${Colors.FocusOutline}`,
    outlineOffset: 1,
    borderRadius: 2
  },
  '&:disabled': {
    opacity: 0.3,
    cursor: 'not-allowed'
  }
})

// UI Text Constants
const SOURCE_PREFIX = 'Source '
const TOOLTIP_REMOVE = 'Remove source'
const TOOLTIP_SHOW = 'Show source'
const TOOLTIP_HIDE = 'Hide source'
const TOOLTIP_LOCK = 'Lock to sync with map'
const TOOLTIP_UNLOCK = 'Unlock to manually control visibility'

// Field Labels
const FIELD_LABEL_NAME = 'Name'
const FIELD_LABEL_SOURCE_URL = 'Source URL'
const FIELD_LABEL_RULES_URL = 'Rules File URL'
const FIELD_LABEL_SOURCE = 'Source'
const FIELD_LABEL_MAP_TYPE = 'Map Type'
const FIELD_LABEL_FILTER = 'Filters'

const PLACEHOLDER_NAME = 'Enter source display name'
const PLACEHOLDER_SOURCE_URL = 'Enter map source URL'
const PLACEHOLDER_RULES_URL = 'Enter rules file URL'
const PLACEHOLDER_SOURCE = 'Enter source identifier (e.g., units)'
const PLACEHOLDER_FILTER = 'e.g., population > 1000'

const TOOLTIP_LOCK_FILTER = 'Lock to sync filter from map'
const TOOLTIP_UNLOCK_FILTER = 'Unlock to manually edit filter'
const TOOLTIP_REMOVE_FILTER = 'Remove filter'
const TOOLTIP_ADD_FILTER = 'Add filter'
const TOOLTIP_LOCK_FILTERS = 'Lock filters to sync from map'
const TOOLTIP_UNLOCK_FILTERS = 'Unlock to add/remove filters'

/**
 * A single filter row with a small action toolbar above the text input.
 * Actions (left to right): lock/unlock, copy, delete.
 */
const FilterItem = (props: {
  filterIndex: number
  expression: string
  isFilterLocked: boolean
  isFilterDisabled: boolean
  filtersLocked: boolean
  fromMap: boolean
  readOnly: boolean
  onExpressionChange: (filterIndex: number, expression: string) => void
  onToggleLocked: (filterIndex: number) => void
  onRemove: (filterIndex: number) => void
}) => {
  const {
    filterIndex, expression, isFilterLocked, isFilterDisabled, filtersLocked, fromMap, readOnly,
    onExpressionChange, onToggleLocked, onRemove
  } = props
  const { copied, copyToClipboard } = useCopyToClipboard()

  const canDelete = !(readOnly && (isFilterLocked || filtersLocked))

  return (
    <div style={styles.filterItem}>
      <div style={styles.filterToolbar}>
        {/* Lock/Unlock (only for map-synced filters in readOnly mode) */}
        {readOnly && fromMap && (
          <Tooltip title={isFilterLocked ? TOOLTIP_UNLOCK_FILTER : TOOLTIP_LOCK_FILTER}>
            <Button
              size={ButtonSize.Small}
              type={ButtonType.Tertiary}
              icon
              css={filterActionButtonStyle}
              onClick={() => onToggleLocked(filterIndex)}
              aria-label={isFilterLocked ? TOOLTIP_UNLOCK_FILTER : TOOLTIP_LOCK_FILTER}
            >
              {isFilterLocked ? <LockOutlined /> : <UnlockOutlined />}
            </Button>
          </Tooltip>
        )}
        {/* Copy — native button matching CopyableLabel style */}
        <Tooltip title={copied ? TOOLTIP_COPIED : TOOLTIP_COPY}>
          <button
            type="button"
            css={filterCopyButtonStyle}
            onClick={() => copyToClipboard(expression)}
            aria-label={`Copy filter ${filterIndex + 1} to clipboard`}
            disabled={!expression}
          >
            <CopyOutlined size={12} color={copied ? Colors.Success : undefined} />
          </button>
        </Tooltip>
        {/* Delete */}
        <Tooltip title={TOOLTIP_REMOVE_FILTER}>
          <Button
            size={ButtonSize.Small}
            type={ButtonType.Tertiary}
            icon
            css={canDelete ? filterActionButtonStyle : filterActionDisabledStyle}
            onClick={() => canDelete && onRemove(filterIndex)}
            aria-label={`${TOOLTIP_REMOVE_FILTER} ${filterIndex + 1}`}
            aria-disabled={!canDelete}
          >
            <TrashOutlined />
          </Button>
        </Tooltip>
      </div>
      <TextInput
        style={{ width: '100%' }}
        value={expression}
        onChange={(e) => onExpressionChange(filterIndex, e.target.value)}
        placeholder={PLACEHOLDER_FILTER}
        disabled={isFilterDisabled}
        aria-label={`${FIELD_LABEL_FILTER} ${filterIndex + 1}`}
      />
    </div>
  )
}

interface SourceConfigCardProps {
  /** The source configuration data */
  sourceConfig: ISourceConfig
  /** The index of this source in the list */
  index: number
  /** Whether the card is expanded */
  isExpanded: boolean
  /** Callback when expand/collapse is toggled */
  onToggleExpanded: () => void
  /** Callback when a field value changes */
  onFieldChange: (updates: Record<string, unknown>) => void
  /** Callback when the source is removed */
  onRemove: () => void
  /** Callback when visibility is toggled */
  onToggleEnabled: () => void
  /** Callback when lock state is toggled */
  onToggleLocked: () => void
  /** Whether the source is in read-only mode (synced with map) */
  readOnly?: boolean
}

/**
 * A card component for displaying and editing a single source configuration.
 * Extracted from SourceConfigList for better modularity.
 * 
 * Features:
 * - Collapsible card with header
 * - Lock/unlock for sync control
 * - Visibility toggle
 * - Remove button (in manual mode)
 * - Field editing with validation
 * 
 * Accessibility:
 * - All action buttons have aria-labels
 * - Keyboard accessible collapse toggle
 */
const SourceConfigCard = (props: SourceConfigCardProps) => {
  const {
    sourceConfig,
    index,
    isExpanded,
    onToggleExpanded,
    onFieldChange,
    onRemove,
    onToggleEnabled,
    onToggleLocked,
    readOnly = false
  } = props

  const sourceName = sourceConfig?.name?.trim() 
    ? sourceConfig.name 
    : `${SOURCE_PREFIX}${index + 1}`
  const isEnabled = sourceConfig.enabled !== false
  const isLocked = sourceConfig.locked ?? DEFAULT_SOURCE_CONFIG.locked
  const filters = sourceConfig.filters || []
  const filtersLocked = sourceConfig.filtersLocked ?? DEFAULT_SOURCE_CONFIG.filtersLocked
  const [filtersExpanded, setFiltersExpanded] = React.useState(false)

  // Field configuration for source properties
  const sourceConfigFields: FieldConfig[] = [
    { key: SourceConfigKey.Name, label: FIELD_LABEL_NAME, type: FieldType.Text, placeholder: PLACEHOLDER_NAME },
    { key: SourceConfigKey.SourceUrl, label: FIELD_LABEL_SOURCE_URL, type: FieldType.Text, placeholder: PLACEHOLDER_SOURCE_URL, validateOnAccept: (val) => validateUrl(String(val)) },
    { key: SourceConfigKey.RulesFileUrl, label: FIELD_LABEL_RULES_URL, type: FieldType.Text, placeholder: PLACEHOLDER_RULES_URL, validateOnAccept: (val) => validateUrl(String(val)) },
    { key: SourceConfigKey.Source, label: FIELD_LABEL_SOURCE, type: FieldType.Text, placeholder: PLACEHOLDER_SOURCE },
    {
      key: SourceConfigKey.MapType,
      label: FIELD_LABEL_MAP_TYPE,
      type: FieldType.Enum,
      enumOptions: [...MAP_TYPE_OPTIONS],
      defaultValue: DEFAULT_SOURCE_CONFIG.mapType,
      showCopyButton: false
    }
  ]

  const renderSourceField = (field: FieldConfig) => {
    const value = (sourceConfig as Record<string, unknown>)[field.key] ?? field.defaultValue
    
    // MapType and RulesFileUrl remain editable even when readOnly is true
    const isFieldDisabled = readOnly && 
      field.key !== SourceConfigKey.MapType && 
      field.key !== SourceConfigKey.RulesFileUrl

    return (
      <FieldRenderer
        key={field.key}
        field={field}
        value={value}
        onChange={(_key, newValue) => onFieldChange({ [field.key]: newValue })}
        disabled={isFieldDisabled}
      />
    )
  }

  const renderActions = () => {
    if (readOnly) {
      return (
        <>
          <Tooltip title={isLocked ? TOOLTIP_UNLOCK : TOOLTIP_LOCK}>
            <Button
              size={ButtonSize.Small}
              type={ButtonType.Tertiary}
              icon
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation()
                onToggleLocked()
              }}
              aria-label={isLocked ? TOOLTIP_UNLOCK : TOOLTIP_LOCK}
              style={{ marginLeft: '4px' }}
            >
              {isLocked ? <LockOutlined /> : <UnlockOutlined />}
            </Button>
          </Tooltip>
          <Tooltip title={isEnabled ? TOOLTIP_HIDE : TOOLTIP_SHOW}>
            <Button
              size={ButtonSize.Small}
              type={ButtonType.Tertiary}
              icon
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation()
                onToggleEnabled()
              }}
              aria-label={isEnabled ? TOOLTIP_HIDE : TOOLTIP_SHOW}
              style={{ marginLeft: '4px' }}
            >
              {isEnabled ? <VisibleOutlined /> : <InvisibleOutlined />}
            </Button>
          </Tooltip>
        </>
      )
    }

    return (
      <>
        <Tooltip title={TOOLTIP_REMOVE}>
          <Button
            size={ButtonSize.Small}
            type={ButtonType.Tertiary}
            icon
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation()
              onRemove()
            }}
            aria-label={`${TOOLTIP_REMOVE} ${sourceName}`}
          >
            <TrashOutlined />
          </Button>
        </Tooltip>
        <Tooltip title={isEnabled ? TOOLTIP_HIDE : TOOLTIP_SHOW}>
          <Button
            size={ButtonSize.Small}
            type={ButtonType.Tertiary}
            icon
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation()
              onToggleEnabled()
            }}
            aria-label={isEnabled ? TOOLTIP_HIDE : TOOLTIP_SHOW}
            style={{ marginLeft: '4px' }}
          >
            {isEnabled ? <VisibleOutlined /> : <InvisibleOutlined />}
          </Button>
        </Tooltip>
      </>
    )
  }

  const updateFilters = (newFilters: IFilterConfig[]) => {
    onFieldChange({ [SourceConfigKey.Filters]: newFilters })
  }

  const onFilterExpressionChange = (filterIndex: number, expression: string) => {
    const newFilters = [...filters]
    newFilters[filterIndex] = { ...newFilters[filterIndex], expression }
    updateFilters(newFilters)
  }

  const onToggleFilterLocked = (filterIndex: number) => {
    const newFilters = [...filters]
    const current = newFilters[filterIndex]
    newFilters[filterIndex] = { ...current, locked: !(current.locked ?? DEFAULT_FILTER_CONFIG.locked) }
    updateFilters(newFilters)
  }

  const onRemoveFilter = (filterIndex: number) => {
    if (readOnly && filtersLocked) return
    const newFilters = filters.filter((_, i) => i !== filterIndex)
    updateFilters(newFilters)
  }

  const onAddFilter = () => {
    if (readOnly && filtersLocked) return
    updateFilters([...filters, { ...DEFAULT_FILTER_CONFIG, locked: false, expression: '' }])
  }

  const onToggleFiltersLocked = () => {
    const newLocked = !filtersLocked
    if (newLocked) {
      // Re-locking: strip user-added filters, re-lock map filters so sync restores them
      const mapOnly = filters.filter(f => f.fromMap).map(f => ({ ...f, locked: true }))
      onFieldChange({ [SourceConfigKey.FiltersLocked]: newLocked, [SourceConfigKey.Filters]: mapOnly })
    } else {
      onFieldChange({ [SourceConfigKey.FiltersLocked]: newLocked })
    }
  }

  const renderFilters = () => {
    const canAdd = !(readOnly && filtersLocked)
    const filterActions = (
      <div style={styles.filtersHeaderActions}>
        {readOnly && (
          <Tooltip title={filtersLocked ? TOOLTIP_UNLOCK_FILTERS : TOOLTIP_LOCK_FILTERS}>
            <Button
              size={ButtonSize.Small}
              type={ButtonType.Tertiary}
              icon
              css={filterActionButtonStyle}
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onToggleFiltersLocked() }}
              aria-label={filtersLocked ? TOOLTIP_UNLOCK_FILTERS : TOOLTIP_LOCK_FILTERS}
            >
              {filtersLocked ? <LockOutlined /> : <UnlockOutlined />}
            </Button>
          </Tooltip>
        )}
        <Tooltip title={TOOLTIP_ADD_FILTER}>
          <Button
            size={ButtonSize.Small}
            type={ButtonType.Tertiary}
            icon
            css={canAdd ? filterActionButtonStyle : filterActionDisabledStyle}
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); canAdd && onAddFilter() }}
            aria-label={TOOLTIP_ADD_FILTER}
            aria-disabled={!canAdd}
          >
            <PlusOutlined />
          </Button>
        </Tooltip>
      </div>
    )

    return (
      <div>
        <CollapsibleHeader
          label={`${FIELD_LABEL_FILTER} (${filters.length})`}
          isOpen={filtersExpanded}
          onToggle={() => setFiltersExpanded(!filtersExpanded)}
          level={CollapsibleHeaderLevel.Section}
          actions={filterActions}
        />
        <Collapse isOpen={filtersExpanded}>
          {filters.map((filter, filterIndex) => {
            const isFilterLocked = filter.locked ?? DEFAULT_FILTER_CONFIG.locked
            const isFilterDisabled = readOnly && isFilterLocked
            const filterExpression = filter.expression ?? ''

            return (
              <FilterItem
                key={filterIndex}
                filterIndex={filterIndex}
                expression={filterExpression}
                isFilterLocked={isFilterLocked}
                isFilterDisabled={isFilterDisabled}
                filtersLocked={filtersLocked}
                fromMap={filter.fromMap === true}
                readOnly={readOnly}
                onExpressionChange={onFilterExpressionChange}
                onToggleLocked={onToggleFilterLocked}
                onRemove={onRemoveFilter}
              />
            )
          })}
          {filters.length === 0 && (
            <div style={{ color: Colors.TextMuted, fontSize: 12, padding: '4px 0' }}>
              No filters configured
            </div>
          )}
        </Collapse>
      </div>
    )
  }

  return (
    <Card style={styles.card}>
      <CollapsibleHeader
        label={sourceName}
        isOpen={isExpanded}
        onToggle={onToggleExpanded}
        backgroundColor={Colors.HeaderBackground}
        level={CollapsibleHeaderLevel.Card}
        actions={renderActions()}
      />
      <Collapse isOpen={isExpanded}>
        <div style={styles.content}>
          {sourceConfigFields.map(renderSourceField)}
          {renderFilters()}
        </div>
      </Collapse>
    </Card>
  )
}

export default SourceConfigCard
