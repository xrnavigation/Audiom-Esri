import { React } from 'jimu-core'
import { SettingRow } from 'jimu-ui/advanced/setting-components'
import { Select, Option, Collapse, Button, Tooltip, TextInput } from 'jimu-ui'
import { ExpandAllOutlined } from 'jimu-icons/outlined/directional/expand-all'
import { CollapseAllOutlined } from 'jimu-icons/outlined/directional/collapse-all'
import { MapType } from '../../../../../shared/audiom-client/AudiomSource'
import { ButtonSize, ButtonType, FlowType, Colors, Padding } from '../enums'
import { DEFAULT_SOURCE_CONFIG, ISourceConfig, MAP_TYPE_OPTIONS } from '../configs'
import { replaceAt } from '../../utils/sourceConfigUtils'
import CopyableLabel from './CopyableLabel'
import CollapsibleHeader from './CollapsibleHeader'
import SourceConfigCard from './SourceConfigCard'

const { useState, useEffect, useMemo } = React

// Typed styles with full key/value validation
const styles = {
  container: { width: '100%' },
  count: {
    color: Colors.TextMuted,
    fontSize: 12,
    marginRight: 4
  },
  mapTypeRow: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'space-between'
  },
  buttonGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 4
  }
} as const satisfies Record<string, React.CSSProperties>

const MAX_DEFAULT_VISIBLE_SOURCES = 3

// UI Text Constants
const HEADING_TEXT = 'Source Configurations'
const TOOLTIP_EXPAND_ALL = 'Expand all sources'
const TOOLTIP_COLLAPSE_ALL = 'Collapse all sources'
const BUTTON_ADD = 'Add Source Configuration'
const FIELD_LABEL_ALL_MAP_TYPE = 'Map Type (All)'
const FIELD_LABEL_ALL_RULES_FILE = 'Rules File (All)'
const MIXED_VALUE_PLACEHOLDER = '-'
const EMPTY_STATE_MESSAGE = 'No sources could be extracted from the ESRI map.'

interface SourceConfigListProps {
  sourceConfigs: ISourceConfig[]
  onChange: (sourceConfigs: ISourceConfig[]) => void
  readOnly?: boolean
}

/**
 * A list component for managing multiple source configurations.
 * Uses SourceConfigCard for individual sources.
 * 
 * Features:
 * - Collapsible list with source count
 * - Bulk map type change (applies to all sources)
 * - Expand/collapse all sources
 * - Add new sources (in manual mode)
 * 
 * Accessibility:
 * - All action buttons have aria-labels
 * - Keyboard accessible navigation
 */
const SourceConfigList = (props: SourceConfigListProps) => {
  const { sourceConfigs, onChange, readOnly = false } = props
  
  // Auto-collapse Source Configurations if 3 or more sources
  const shouldAutoCollapse = useMemo(() => sourceConfigs.length >= MAX_DEFAULT_VISIBLE_SOURCES, [sourceConfigs.length])
  const [sourceConfigsOpen, setSourceConfigsOpen] = useState(!shouldAutoCollapse)
  // Derive the common map type from sources — if all sources share the same type, show it; otherwise it's mixed
  const commonMapType = useMemo(() => {
    if (sourceConfigs.length === 0) return DEFAULT_SOURCE_CONFIG.mapType
    const firstType = sourceConfigs[0]?.mapType ?? DEFAULT_SOURCE_CONFIG.mapType
    const allSame = sourceConfigs.every(config => (config.mapType ?? DEFAULT_SOURCE_CONFIG.mapType) === firstType)
    return allSame ? firstType : null
  }, [sourceConfigs])
  const [expandedSources, setExpandedSources] = useState<{ [key: number]: boolean }>(() => {
    // Initialize: expand all if less than 3 sources
    const initial: { [key: number]: boolean } = {}
    sourceConfigs.forEach((_, index) => {
      initial[index] = !shouldAutoCollapse
    })
    return initial
  })

  // Update sourceConfigsOpen when source count crosses threshold
  useEffect(() => {
    if (sourceConfigs.length < MAX_DEFAULT_VISIBLE_SOURCES) {
      setSourceConfigsOpen(true)
    }
  }, [sourceConfigs.length])

  const toggleSourceExpanded = (index: number) => {
    setExpandedSources(prev => ({
      ...prev,
      [index]: prev[index] !== undefined ? !prev[index] : false
    }))
  }

  const expandAllSources = () => {
    const allExpanded: { [key: number]: boolean } = {}
    sourceConfigs.forEach((_, index) => {
      allExpanded[index] = true
    })
    setExpandedSources(allExpanded)
  }

  const collapseAllSources = () => {
    const allCollapsed: { [key: number]: boolean } = {}
    sourceConfigs.forEach((_, index) => {
      allCollapsed[index] = false
    })
    setExpandedSources(allCollapsed)
  }

  const onAllMapTypeChange = (mapType: MapType) => {
    const newSourceConfigs = sourceConfigs.map(config => ({
      ...config,
      mapType
    }))
    onChange(newSourceConfigs)
  }

  // Check if sources have different rules files (memoized — recomputes only when sourceConfigs changes)
  const hasMixedRulesFiles = useMemo<boolean>(() => {
    if (sourceConfigs.length === 0) return false
    const firstRulesFile = sourceConfigs[0]?.rulesFileUrl ?? ''
    return sourceConfigs.some(config => (config.rulesFileUrl ?? '') !== firstRulesFile)
  }, [sourceConfigs])

  // Get the current rules file value for display
  const getAllRulesFileValue = (): string => {
    if (sourceConfigs.length === 0) return ''
    if (hasMixedRulesFiles) return MIXED_VALUE_PLACEHOLDER
    return sourceConfigs[0]?.rulesFileUrl ?? ''
  }

  const onAllRulesFileChange = (rulesFileUrl: string) => {
    const newSourceConfigs = sourceConfigs.map(config => ({
      ...config,
      rulesFileUrl
    }))
    onChange(newSourceConfigs)
  }

  const onSourceConfigChange = (index: number, updates: Partial<ISourceConfig>) => {
    onChange(replaceAt(sourceConfigs, index, updates))
  }

  const onAddSourceConfig = () => {
    onChange([...sourceConfigs, { ...DEFAULT_SOURCE_CONFIG }])
  }

  const onRemoveSourceConfig = (index: number) => {
    onChange(sourceConfigs.filter((_, i) => i !== index))
  }

  const onToggleSourceEnabled = (index: number) => {
    const current = sourceConfigs[index]
    const currentEnabled = current.enabled ?? DEFAULT_SOURCE_CONFIG.enabled
    // Auto-unlock when manually toggling visibility
    onChange(replaceAt(sourceConfigs, index, { enabled: !currentEnabled, locked: false }))
  }

  const onToggleLocked = (index: number) => {
    const currentLocked = sourceConfigs[index].locked ?? DEFAULT_SOURCE_CONFIG.locked
    // If re-locking, the sync manager will restore the enabled state on next sync
    onChange(replaceAt(sourceConfigs, index, { locked: !currentLocked }))
  }

  return (
    <div style={styles.container}>
      {/* Source Configurations header with source count */}
      <CollapsibleHeader
        label={HEADING_TEXT}
        isOpen={sourceConfigsOpen}
        onToggle={() => setSourceConfigsOpen(!sourceConfigsOpen)}
        actions={
          <span style={styles.count}>
            {sourceConfigs.length} {sourceConfigs.length === 1 ? 'source' : 'sources'}
          </span>
        }
      />
      <Collapse isOpen={sourceConfigsOpen}>
        {/* Empty state message when no sources */}
        {sourceConfigs.length === 0 && readOnly && (
          <div style={{ textAlign: 'center', padding: '16px', color: Colors.TextMuted }}>
            {EMPTY_STATE_MESSAGE}
          </div>
        )}
        {/* Map Type (All) field with expand/collapse all buttons */}
        {sourceConfigs.length > 0 && (
          <div style={{ paddingLeft: Padding.SectionContent, paddingBottom: Padding.FieldGroupBottom }}>
          <SettingRow flow={FlowType.Wrap}>
            <div style={styles.mapTypeRow}>
              <CopyableLabel label={FIELD_LABEL_ALL_MAP_TYPE} copyValue={''} showCopyButton={false} />
              <div style={styles.buttonGroup}>
                <Tooltip title={TOOLTIP_EXPAND_ALL}>
                  <Button
                    size={ButtonSize.Small}
                    type={ButtonType.Tertiary}
                    icon
                    onClick={expandAllSources}
                    aria-label={TOOLTIP_EXPAND_ALL}
                  >
                    <ExpandAllOutlined />
                  </Button>
                </Tooltip>
                <Tooltip title={TOOLTIP_COLLAPSE_ALL}>
                  <Button
                    size={ButtonSize.Small}
                    type={ButtonType.Tertiary}
                    icon
                    onClick={collapseAllSources}
                    aria-label={TOOLTIP_COLLAPSE_ALL}
                  >
                    <CollapseAllOutlined />
                  </Button>
                </Tooltip>
              </div>
            </div>
            <Select
              style={{ width: '100%' }}
              value={commonMapType === null ? '' : commonMapType}
              onChange={(e) => onAllMapTypeChange(e.target.value as MapType)}
            >
              {commonMapType === null && (
                <Option value="" disabled style={{ fontStyle: 'italic' }}>Mixed</Option>
              )}
              {MAP_TYPE_OPTIONS.map(opt => (
                <Option key={opt.value} value={opt.value}>{opt.label}</Option>
              ))}
            </Select>
          </SettingRow>
          <SettingRow flow={FlowType.Wrap}>
            <CopyableLabel label={FIELD_LABEL_ALL_RULES_FILE} copyValue={getAllRulesFileValue()} showCopyButton={true} />
            <TextInput
              style={{ width: '100%' }}
              value={getAllRulesFileValue()}
              onChange={(e) => onAllRulesFileChange(e.target.value)}
              placeholder="Enter rules file URL"
            />
          </SettingRow>
          </div>
        )}
        {sourceConfigs.map((sourceConfig, index) => {
          const isExpanded = expandedSources[index] !== undefined ? expandedSources[index] : true

          return (
            <SourceConfigCard
              key={index}
              sourceConfig={sourceConfig}
              index={index}
              isExpanded={isExpanded}
              onToggleExpanded={() => toggleSourceExpanded(index)}
              onFieldChange={(updates) => onSourceConfigChange(index, updates)}
              onRemove={() => onRemoveSourceConfig(index)}
              onToggleEnabled={() => onToggleSourceEnabled(index)}
              onToggleLocked={() => onToggleLocked(index)}
              readOnly={readOnly}
            />
          )
        })}
        {!readOnly && (
          <SettingRow>
            <Button
              size={ButtonSize.Small}
              type={ButtonType.Primary}
              onClick={onAddSourceConfig}
            >
              {BUTTON_ADD}
            </Button>
          </SettingRow>
        )}
      </Collapse>
    </div>
  )
}

export default SourceConfigList
