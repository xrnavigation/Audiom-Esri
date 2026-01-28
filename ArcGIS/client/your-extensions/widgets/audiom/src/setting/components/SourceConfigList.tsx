import { React } from 'jimu-core'
import { SettingRow } from 'jimu-ui/advanced/setting-components'
import { Select, Option, Collapse, Button, Tooltip } from 'jimu-ui'
import { ExpandAllOutlined } from 'jimu-icons/outlined/directional/expand-all'
import { CollapseAllOutlined } from 'jimu-icons/outlined/directional/collapse-all'
import { MapType } from '../../../../../shared/audiom-client/AudiomSource'
import { ISourceConfig } from '../configs'
import { ButtonSize, ButtonType, FlowType, Colors } from '../enums'
import { Padding } from '../paddings'
import CopyableLabel from './CopyableLabel'
import CollapsibleHeader from './CollapsibleHeader'
import SourceConfigCard from './SourceConfigCard'
import '../../styles/widget.css'

const { useState, useEffect, useMemo } = React

const MAX_DEFAULT_VISIBLE_SOURCES = 3

// UI Text Constants
const HEADING_TEXT = 'Source Configurations'
const TOOLTIP_EXPAND_ALL = 'Expand all sources'
const TOOLTIP_COLLAPSE_ALL = 'Collapse all sources'
const BUTTON_ADD = 'Add Source Configuration'
const FIELD_LABEL_ALL_MAP_TYPE = 'Map Type (All)'
const MAP_TYPE_LABEL_TRAVEL = 'Travel'
const MAP_TYPE_LABEL_HEATMAP = 'Heatmap'
const MAP_TYPE_LABEL_INDOOR = 'Indoor'

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
  // Independent state for the "Map Type (All)" selector - not derived from sources
  const [allMapType, setAllMapType] = useState<MapType>(MapType.Indoor)
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
    if (sourceConfigs.length < 3) {
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
    setAllMapType(mapType)
    const newSourceConfigs = sourceConfigs.map(config => ({
      ...config,
      mapType
    }))
    onChange(newSourceConfigs)
  }

  // Check if sources have different map types
  const hasMixedMapTypes = (): boolean => {
    if (sourceConfigs.length === 0) return false
    const firstType = sourceConfigs[0]?.mapType ?? MapType.Indoor
    return sourceConfigs.some(config => (config.mapType ?? MapType.Indoor) !== firstType)
  }

  const onSourceConfigChange = (index: number, property: string, value: any) => {
    const newSourceConfigs = [...sourceConfigs]
    newSourceConfigs[index] = { ...newSourceConfigs[index], [property]: value }
    onChange(newSourceConfigs)
  }

  const onAddSourceConfig = () => {
    const newSourceConfigs = [...sourceConfigs]
    newSourceConfigs.push({})
    onChange(newSourceConfigs)
  }

  const onRemoveSourceConfig = (index: number) => {
    const newSourceConfigs = [...sourceConfigs]
    newSourceConfigs.splice(index, 1)
    onChange(newSourceConfigs)
  }

  const onToggleSourceEnabled = (index: number) => {
    const newSourceConfigs = [...sourceConfigs]
    const currentEnabled = newSourceConfigs[index].enabled ?? true
    // Auto-unlock when manually toggling visibility
    newSourceConfigs[index] = { 
      ...newSourceConfigs[index], 
      enabled: !currentEnabled,
      locked: false 
    }
    onChange(newSourceConfigs)
  }

  const onToggleLocked = (index: number) => {
    const newSourceConfigs = [...sourceConfigs]
    const currentLocked = newSourceConfigs[index].locked ?? true
    newSourceConfigs[index] = { ...newSourceConfigs[index], locked: !currentLocked }
    // If re-locking, the sync manager will restore the enabled state on next sync
    onChange(newSourceConfigs)
  }

  return (
    <div className="audiom-source-config-list">
      {/* Source Configurations header with source count */}
      <CollapsibleHeader
        label={HEADING_TEXT}
        isOpen={sourceConfigsOpen}
        onToggle={() => setSourceConfigsOpen(!sourceConfigsOpen)}
        actions={
          sourceConfigs.length > 0 ? (
            <span className="audiom-source-config-list__count">
              {sourceConfigs.length} {sourceConfigs.length === 1 ? 'source' : 'sources'}
            </span>
          ) : undefined
        }
      />
      <Collapse isOpen={sourceConfigsOpen}>
        {/* Map Type (All) field with expand/collapse all buttons */}
        {sourceConfigs.length > 0 && (
          <div style={{ paddingLeft: Padding.SectionContent, paddingBottom: Padding.FieldGroupBottom }}>
          <SettingRow flow={FlowType.Wrap}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
              <CopyableLabel label={FIELD_LABEL_ALL_MAP_TYPE} copyValue={''} showCopyButton={false} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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
              value={hasMixedMapTypes() ? '' : allMapType}
              onChange={(e) => onAllMapTypeChange(e.target.value as MapType)}
            >
              {hasMixedMapTypes() && (
                <Option value="" disabled style={{ fontStyle: 'italic' }}>Mixed</Option>
              )}
              <Option value={MapType.Indoor}>{MAP_TYPE_LABEL_INDOOR}</Option>
              <Option value={MapType.Heatmap}>{MAP_TYPE_LABEL_HEATMAP}</Option>
              <Option value={MapType.Travel}>{MAP_TYPE_LABEL_TRAVEL}</Option>
            </Select>
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
              onFieldChange={(property, value) => onSourceConfigChange(index, property, value)}
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
