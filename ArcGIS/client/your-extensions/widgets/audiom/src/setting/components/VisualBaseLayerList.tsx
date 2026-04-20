import { React } from 'jimu-core'
import { Collapse, Button } from 'jimu-ui'
import { IVisualBaseLayerConfig, DEFAULT_VISUAL_BASE_LAYER } from '../configs'
import { ButtonType, FlowType } from '../enums'
import { SettingRow } from 'jimu-ui/advanced/setting-components'
import { replaceAt } from '../../utils/sourceConfigUtils'
import CollapsibleHeader from './CollapsibleHeader'
import VisualBaseLayerCard from './VisualBaseLayerCard'

const { useState, useCallback } = React

// UI Text Constants
const HEADING_TEXT = 'Visual Base Layers'
const BUTTON_ADD = 'Add Base Layer'
const EMPTY_STATE = 'No visual base layers configured.'

interface VisualBaseLayerListProps {
  layers: IVisualBaseLayerConfig[]
  onChange: (layers: IVisualBaseLayerConfig[]) => void
}

const VisualBaseLayerList = (props: VisualBaseLayerListProps) => {
  const { layers, onChange } = props
  const [isOpen, setIsOpen] = useState(layers.length > 0)
  const [expandedLayers, setExpandedLayers] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {}
    layers.forEach((_, i) => { initial[i] = true })
    return initial
  })

  const toggleLayerExpanded = useCallback((index: number) => {
    setExpandedLayers(prev => ({ ...prev, [index]: !prev[index] }))
  }, [])

  const handleFieldChange = useCallback((index: number, field: keyof IVisualBaseLayerConfig, value: string | undefined) => {
    onChange(replaceAt(layers, index, { [field]: value } as Partial<IVisualBaseLayerConfig>))
  }, [layers, onChange])

  const handleRemove = useCallback((index: number) => {
    const updated = layers.filter((_, i) => i !== index)
    onChange(updated)
    // Clean up expanded state
    setExpandedLayers(prev => {
      const next: Record<number, boolean> = {}
      updated.forEach((_, i) => { next[i] = prev[i >= index ? i + 1 : i] ?? true })
      return next
    })
  }, [layers, onChange])

  const handleAdd = useCallback(() => {
    const updated = [...layers, { ...DEFAULT_VISUAL_BASE_LAYER }]
    onChange(updated)
    setExpandedLayers(prev => ({ ...prev, [updated.length - 1]: true }))
  }, [layers, onChange])

  const countSuffix = layers.length > 0 ? ` (${layers.length})` : ''

  return (
    <div style={{ width: '100%' }}>
      <CollapsibleHeader
        label={`${HEADING_TEXT}${countSuffix}`}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
      />
      <Collapse isOpen={isOpen}>
        {layers.length === 0 ? (
          <SettingRow flow={FlowType.Wrap}>
            <span style={{ fontSize: '12px', color: 'var(--ref-palette-neutral-900, #6b7280)' }}>{EMPTY_STATE}</span>
          </SettingRow>
        ) : (
          layers.map((layer, index) => (
            <VisualBaseLayerCard
              key={index}
              layer={layer}
              index={index}
              isExpanded={expandedLayers[index] ?? true}
              onToggleExpanded={() => toggleLayerExpanded(index)}
              onFieldChange={(field, value) => handleFieldChange(index, field, value)}
              onRemove={() => handleRemove(index)}
            />
          ))
        )}
        <SettingRow flow={FlowType.Wrap}>
          <Button
            type={ButtonType.Primary}
            style={{ width: '100%', marginBottom: 12 }}
            onClick={handleAdd}
          >
            {BUTTON_ADD}
          </Button>
        </SettingRow>
      </Collapse>
    </div>
  )
}

export default VisualBaseLayerList
