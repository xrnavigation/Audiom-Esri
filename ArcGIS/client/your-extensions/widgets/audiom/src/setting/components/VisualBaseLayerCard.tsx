import { React } from 'jimu-core'
import { Card, Collapse, TextInput, Tooltip, Button } from 'jimu-ui'
import { TrashOutlined } from 'jimu-icons/outlined/editor/trash'
import { IVisualBaseLayerConfig } from '../configs'
import { ButtonSize, ButtonType, Colors } from '../enums'
import { Padding } from '../paddings'
import { validateUrl } from '../validation/validation'
import CollapsibleHeader, { CollapsibleHeaderLevel } from './CollapsibleHeader'
import CopyableLabel from './CopyableLabel'
import GeoQuadEditor from './GeoQuadEditor'

const { useCallback } = React

// UI Text Constants
const LAYER_PREFIX = 'Layer '
const FIELD_LABEL_URL = 'Image URL'
const PLACEHOLDER_URL = 'Enter image URL for visual base layer'
const TOOLTIP_REMOVE = 'Remove layer'

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
  onRemove: () => void
}

const VisualBaseLayerCard = (props: VisualBaseLayerCardProps) => {
  const { layer, index, isExpanded, onToggleExpanded, onFieldChange, onRemove } = props

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onFieldChange('url', e.target.value)
  }, [onFieldChange])

  const handlePositionChange = useCallback((value: string) => {
    onFieldChange('position', value || undefined)
  }, [onFieldChange])

  // Safely derive label — URL parsing can fail
  let safeLabel: string
  try {
    safeLabel = layer.url ? (new URL(layer.url).pathname.split('/').pop() || `${LAYER_PREFIX}${index + 1}`) : `${LAYER_PREFIX}${index + 1}`
  } catch {
    safeLabel = layer.url ? `${LAYER_PREFIX}${index + 1}` : `${LAYER_PREFIX}${index + 1}`
  }

  const actions = (
    <div style={styles.actions}>
      <Tooltip title={TOOLTIP_REMOVE}>
        <Button
          type={ButtonType.Tertiary}
          size={ButtonSize.Small}
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); onRemove() }}
          aria-label={`${TOOLTIP_REMOVE} ${index + 1}`}
        >
          <TrashOutlined size={12} />
        </Button>
      </Tooltip>
    </div>
  )

  return (
    <Card style={styles.card}>
      <CollapsibleHeader
        label={safeLabel}
        isOpen={isExpanded}
        onToggle={onToggleExpanded}
        level={CollapsibleHeaderLevel.Card}
        actions={actions}
      />
      <Collapse isOpen={isExpanded}>
        <div style={styles.content}>
          <CopyableLabel label={FIELD_LABEL_URL} copyValue={layer.url || ''} />
          <TextInput
            style={{ width: '100%', marginBottom: Padding.ElementGap }}
            value={layer.url || ''}
            onChange={handleUrlChange}
            placeholder={PLACEHOLDER_URL}
            checkValidityOnAccept={(text) => validateUrl(String(text))}
            aria-label={`${FIELD_LABEL_URL} for layer ${index + 1}`}
          />
          <GeoQuadEditor
            value={layer.position ?? ''}
            onChange={handlePositionChange}
          />
        </div>
      </Collapse>
    </Card>
  )
}

export default VisualBaseLayerCard
