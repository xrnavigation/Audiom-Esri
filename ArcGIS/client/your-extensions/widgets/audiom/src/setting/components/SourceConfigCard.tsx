import { React } from 'jimu-core'
import { Card, Collapse, Button, Tooltip } from 'jimu-ui'
import { VisibleOutlined } from 'jimu-icons/outlined/application/visible'
import { InvisibleOutlined } from 'jimu-icons/outlined/application/invisible'
import { LockOutlined } from 'jimu-icons/outlined/editor/lock'
import { UnlockOutlined } from 'jimu-icons/outlined/editor/unlock'
import { TrashOutlined } from 'jimu-icons/outlined/editor/trash'
import { MapType } from '../../../../../shared/audiom-client/AudiomSource'
import { FieldConfig, ISourceConfig } from '../configs'
import { ButtonSize, ButtonType, FieldType, Colors } from '../enums'
import { SourceConfigKey } from '../configKeys'
import { validateUrl } from '../validation/validation'
import CollapsibleHeader, { CollapsibleHeaderLevel } from './CollapsibleHeader'
import FieldRenderer from './FieldRenderer'

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

const PLACEHOLDER_NAME = 'Enter source display name'
const PLACEHOLDER_SOURCE_URL = 'Enter map source URL'
const PLACEHOLDER_RULES_URL = 'Enter rules file URL'
const PLACEHOLDER_SOURCE = 'Enter source identifier (e.g., units)'

const MAP_TYPE_LABEL_TRAVEL = 'Travel'
const MAP_TYPE_LABEL_HEATMAP = 'Heatmap'
const MAP_TYPE_LABEL_INDOOR = 'Indoor'

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
  onFieldChange: (property: string, value: unknown) => void
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
  const isLocked = sourceConfig.locked ?? true

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
      enumOptions: [
        { label: MAP_TYPE_LABEL_TRAVEL, value: MapType.Travel },
        { label: MAP_TYPE_LABEL_HEATMAP, value: MapType.Heatmap },
        { label: MAP_TYPE_LABEL_INDOOR, value: MapType.Indoor }
      ],
      defaultValue: MapType.Indoor,
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
        onChange={(_key, newValue) => onFieldChange(field.key, newValue)}
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
    )
  }

  return (
    <Card className="audiom-source-card">
      <CollapsibleHeader
        label={sourceName}
        isOpen={isExpanded}
        onToggle={onToggleExpanded}
        backgroundColor={Colors.HeaderBackground}
        level={CollapsibleHeaderLevel.Card}
        actions={renderActions()}
      />
      <Collapse isOpen={isExpanded}>
        <div className="audiom-source-card__content">
          {sourceConfigFields.map(renderSourceField)}
        </div>
      </Collapse>
    </Card>
  )
}

export default SourceConfigCard
