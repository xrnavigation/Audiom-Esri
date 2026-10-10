import { React } from 'jimu-core'
import { Card, Collapse, Option, Select, TextInput } from 'jimu-ui'
import { TrashOutlined } from 'jimu-icons/outlined/editor/trash'
import { IVisualBaseLayerConfig, VISUAL_BASE_LAYER_TYPE_OPTIONS } from '../configs'
import { VisualBaseLayerType } from '../../../../../shared/audiom-client/AudiomEmbedConfig'
import { Padding } from '../enums'
import { validateUrl } from '../validation/validation'
import CollapsibleHeader, { CollapsibleHeaderLevel } from './CollapsibleHeader'
import CopyableLabel from './CopyableLabel'
import GeoQuadEditor from './GeoQuadEditor'
import IconActionButton from './IconActionButton'

const { useCallback } = React

// UI Text Constants
const LAYER_PREFIX = 'Layer '
const FIELD_LABEL_URL = 'Image URL'
const PLACEHOLDER_URL = 'Enter image URL for visual base layer'
const TOOLTIP_REMOVE = 'Remove layer'
const FIELD_LABEL_TYPE = 'Base Layer Source Type'
const FIELD_LABEL_FEATURE_URL = 'Feature layer URL'
const PLACEHOLDER_FEATURE_URL = 'https://.../FeatureServer/0'



const styles = {
  card: {
    marginBottom: 12,
    border: 0
  } as React.CSSProperties,
  content: {
    padding: Padding.CardContent
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 4
  } as React.CSSProperties
}

interface VisualBaseLayerCardProps {
  layer: IVisualBaseLayerConfig
  index: number
  isExpanded: boolean
  onToggleExpanded: () => void
  onFieldChange: (field: keyof IVisualBaseLayerConfig, value: string | undefined) => void
  onBaseLayerTypeChange: (type: VisualBaseLayerType) => void
  onRemove: () => void
}

const VisualBaseLayerCard = (props: VisualBaseLayerCardProps) => {
  const { layer, index, isExpanded, onToggleExpanded, onFieldChange, onBaseLayerTypeChange, onRemove } = props
  const isFeature = layer.type === VisualBaseLayerType.Feature

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onFieldChange('url', e.target.value)
  }, [onFieldChange])

  const handleTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value === VisualBaseLayerType.Feature
      ? VisualBaseLayerType.Feature
      : VisualBaseLayerType.Image
    onBaseLayerTypeChange(next)
  }, [onBaseLayerTypeChange])

  const handlePositionChange = useCallback((value: string) => {
    onFieldChange('position', value || undefined)
  }, [onFieldChange])

  // Safely derive label — URL parsing can fail; fall back to a generic numbered label
  const fallbackLabel = `${LAYER_PREFIX}${index + 1}`
  let safeLabel: string = fallbackLabel
  if (layer.url) {
    try {
      safeLabel = new URL(layer.url).pathname.split('/').pop() || fallbackLabel
    } catch {
      // Keep fallbackLabel
    }
  }

  const actions = (
    <div style={styles.actions}>
      <IconActionButton
        tooltip={TOOLTIP_REMOVE}
        ariaLabel={`${TOOLTIP_REMOVE} ${index + 1}`}
        onClick={onRemove}
        stopPropagation
      >
        <TrashOutlined />
      </IconActionButton>
    </div>
  )

  return (
    <Card style={styles.card}>
      <CollapsibleHeader
        label={safeLabel}
        isOpen={isExpanded}
        onToggle={onToggleExpanded}
        level={CollapsibleHeaderLevel.Card}
        showLabelTooltip
        actions={actions}
      />
      <Collapse isOpen={isExpanded}>
        <div style={styles.content}>
          <CopyableLabel
            label={FIELD_LABEL_TYPE}
            copyValue={layer.type || VisualBaseLayerType.Image}
            showCopyButton={false}
          />
          <Select
            style={{ width: '100%', marginBottom: Padding.ElementGap }}
            value={layer.type || VisualBaseLayerType.Image}
            onChange={handleTypeChange}
            aria-label={`${FIELD_LABEL_TYPE} for layer ${index + 1}`}
          >
            {VISUAL_BASE_LAYER_TYPE_OPTIONS.map((option) => (
              <Option key={option.value} value={option.value}>
                {option.label}
              </Option>
            ))}
          </Select>
          <CopyableLabel
            label={isFeature ? FIELD_LABEL_FEATURE_URL : FIELD_LABEL_URL}
            copyValue={layer.url || ''}
          />
          <TextInput
            style={{ width: '100%', marginBottom: Padding.ElementGap }}
            value={layer.url || ''}
            onChange={handleUrlChange}
            placeholder={isFeature ? PLACEHOLDER_FEATURE_URL : PLACEHOLDER_URL}
            checkValidityOnAccept={(text) => validateUrl(String(text))}
            aria-label={`${FIELD_LABEL_URL} for layer ${index + 1}`}
          />
          {!isFeature && (
            <GeoQuadEditor
              value={layer.position ?? ''}
              onChange={handlePositionChange}
            />
          )}
        </div>
      </Collapse>
    </Card>
  )
}

export default VisualBaseLayerCard
