import { React } from 'jimu-core'
import { Card, Collapse, Option, Select, TextInput } from 'jimu-ui'
import { TrashOutlined } from 'jimu-icons/outlined/editor/trash'
import { VisibleOutlined } from 'jimu-icons/outlined/application/visible'
import { InvisibleOutlined } from 'jimu-icons/outlined/application/invisible'
import { IVisualBaseLayerConfig, VISUAL_BASE_LAYER_TYPE_OPTIONS, isVisualBaseLayerNameLocked } from '../configs'
import { VisualBaseLayerType } from '../../../../../shared/audiom-client/AudiomEmbedConfig'
import { Padding } from '../enums'
import { TOOLTIP_HIDE_VISUAL_BASE_LAYER, TOOLTIP_LOCK_LAYER_NAME, TOOLTIP_SHOW_VISUAL_BASE_LAYER, TOOLTIP_UNLOCK_LAYER_NAME } from '../strings'
import { validateUrl, validateImageLayerUrl } from '../validation/validation'
import CollapsibleHeader, { CollapsibleHeaderLevel } from './CollapsibleHeader'
import CopyableLabel from './CopyableLabel'
import GeoQuadEditor from './GeoQuadEditor'
import IconActionButton from './IconActionButton'
import LockToggle from './LockToggle'

const { useCallback } = React

// UI Text Constants
const LAYER_PREFIX = 'Layer '
const FIELD_LABEL_URL = 'Image URL'
const PLACEHOLDER_URL = 'Enter image URL for visual base layer'
const TOOLTIP_REMOVE = 'Remove layer'
const FIELD_LABEL_TYPE = 'Base Layer Source Type'
const FIELD_LABEL_IMAGE_URL = 'Image Server URL'
const PLACEHOLDER_IMAGE_SERVER_URL = 'https://.../ImageServer'
const FIELD_LABEL_LAYER_NAME = 'Layer Name'
const PLACEHOLDER_LAYER_NAME = 'Enter a name (optional)'


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
  onUrlChange: (url: string, layerNameUpdate?: { layerName: string | undefined }) => void
  onBaseLayerTypeChange: (type: VisualBaseLayerType) => void
  onToggleVisible: () => void
  onLayerNameLockChange: (locked: boolean, layerName: string | undefined) => void
  onRemove: () => void
}

/** Filename from a layer URL, or undefined when the URL cannot provide one. */
function nameFromLayerUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).pathname.split('/').pop() || undefined
  } catch {
    return undefined
  }
}

/** A non-empty URL that changed and passes the layer type's validator. */
function isNewValidBaseLayerUrl(currentUrl: string | undefined, nextUrl: string, isFeature: boolean): boolean {
  const trimmed = nextUrl.trim()
  if (!trimmed || trimmed === (currentUrl ?? '').trim()) return false
  return (isFeature ? validateImageLayerUrl(trimmed) : validateUrl(trimmed)).valid
}

const VisualBaseLayerCard = (props: VisualBaseLayerCardProps) => {
  const {
    layer, index, isExpanded, onToggleExpanded, onFieldChange, onUrlChange, onBaseLayerTypeChange,
    onToggleVisible, onLayerNameLockChange, onRemove
  } = props
  const isFeature = layer.type === VisualBaseLayerType.Feature
  // Missing `visible` means shown, matching DEFAULT_VISUAL_BASE_LAYER.
  const isVisible = layer.visible !== false
  const visibilityTooltip = isVisible ? TOOLTIP_HIDE_VISUAL_BASE_LAYER : TOOLTIP_SHOW_VISUAL_BASE_LAYER
  // Missing `layerNameLocked` means locked, so the name follows the URL.
  const isLayerNameLocked = isVisualBaseLayerNameLocked(layer)
  const derivedName = nameFromLayerUrl(layer.url)
  const customName = !isLayerNameLocked ? layer.layerName?.trim() : ''
  const layerNameValue = isLayerNameLocked ? (derivedName ?? '') : (layer.layerName ?? '')

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const nextUrl = e.target.value
    // Refresh the stored name from the URL even when the name field is unlocked.
    if (isNewValidBaseLayerUrl(layer.url, nextUrl, isFeature)) {
      onUrlChange(nextUrl, { layerName: nameFromLayerUrl(nextUrl.trim()) })
      return
    }
    onUrlChange(nextUrl)
  }, [layer.url, isFeature, onUrlChange])

  const handleLayerNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLayerNameLocked) return
    onFieldChange('layerName', e.target.value || undefined)
  }, [onFieldChange, isLayerNameLocked])

  const handleLayerNameLockToggle = useCallback(() => {
    if (isLayerNameLocked) {
      onLayerNameLockChange(false, layer.layerName?.trim() || derivedName)
    } else {
      onLayerNameLockChange(true, layer.layerName || undefined)
    }
  }, [isLayerNameLocked, layer.layerName, derivedName, onLayerNameLockChange])

  const handleTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value === VisualBaseLayerType.Feature
      ? VisualBaseLayerType.Feature
      : VisualBaseLayerType.Image
    onBaseLayerTypeChange(next)
  }, [onBaseLayerTypeChange])

  const handlePositionChange = useCallback((value: string) => {
    onFieldChange('position', value || undefined)
  }, [onFieldChange])

  // Locked names follow the URL. An unlocked non-empty name overrides that.
  const fallbackLabel = `${LAYER_PREFIX}${index + 1}`
  const safeLabel = customName || derivedName || fallbackLabel

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
      <IconActionButton
        tooltip={visibilityTooltip}
        ariaLabel={`${visibilityTooltip} ${index + 1}`}
        onClick={onToggleVisible}
        stopPropagation
        active={!isVisible}
      >
        {isVisible ? <VisibleOutlined /> : <InvisibleOutlined />}
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
            label={isFeature ? FIELD_LABEL_IMAGE_URL : FIELD_LABEL_URL}
            copyValue={layer.url || ''}
          />
          <TextInput
            style={{ width: '100%', marginBottom: Padding.ElementGap }}
            value={layer.url || ''}
            onChange={handleUrlChange}
            placeholder={isFeature ? PLACEHOLDER_IMAGE_SERVER_URL : PLACEHOLDER_URL}
            checkValidityOnAccept={(text) => (
              isFeature ? validateImageLayerUrl(String(text)) : validateUrl(String(text))
            )}
            aria-label={`${isFeature ? FIELD_LABEL_IMAGE_URL : FIELD_LABEL_URL} for layer ${index + 1}`}
          />
          <CopyableLabel
            label={FIELD_LABEL_LAYER_NAME}
            copyValue={layerNameValue}
            actions={
              <LockToggle
                locked={isLayerNameLocked}
                onToggle={handleLayerNameLockToggle}
                unlockTooltip={TOOLTIP_UNLOCK_LAYER_NAME}
                lockTooltip={TOOLTIP_LOCK_LAYER_NAME}
              />
            }
          />
          <TextInput
            style={{ width: '100%', marginBottom: Padding.ElementGap }}
            value={layerNameValue}
            onChange={handleLayerNameChange}
            placeholder={PLACEHOLDER_LAYER_NAME}
            disabled={isLayerNameLocked}
            aria-label={`${FIELD_LABEL_LAYER_NAME} for layer ${index + 1}`}
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
