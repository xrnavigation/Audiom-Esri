import { React } from 'jimu-core'
import { MapViewManager } from 'jimu-arcgis'
import { Collapse, Button } from 'jimu-ui'
import { VisualBaseLayerType } from '../../../../../shared/audiom-client/AudiomEmbedConfig'
import { IVisualBaseLayerConfig, DEFAULT_VISUAL_BASE_LAYER } from '../configs'
import { ButtonType, FlowType } from '../enums'
import { SettingRow } from 'jimu-ui/advanced/setting-components'
import { getJimuMapViewById, getMapImageryLayers, type MapImageryLayer } from '../../utils/mapUtils'
import { replaceAt } from '../../utils/sourceConfigUtils'
import CollapsibleHeader from './CollapsibleHeader'
import VisualBaseLayerCard, { type VisualBaseLayerUrlUpdate } from './VisualBaseLayerCard'

const { useState, useCallback } = React

// UI Text Constants
const HEADING_TEXT = 'Visual Base Layers'
const BUTTON_ADD = 'Add Base Layer'
const BUTTON_IMPORT = 'Import Base Layers'
const EMPTY_STATE = 'No visual base layers configured.'

interface VisualBaseLayerListProps {
  layers: IVisualBaseLayerConfig[]
  onChange: (layers: IVisualBaseLayerConfig[]) => void
  /** Map widget id whose Imagery layers can be imported. */
  mapId?: string

  // Whether to show the "Import Base Layers" button. If true, the button is hidden.
  useExistingMap?: boolean
}

/** Compare service URLs without trailing-slash or case differences. */
function normalizeLayerUrl(url: string | undefined): string | undefined {
  const trimmed = url?.trim()
  if (!trimmed) return undefined
  return trimmed.replace(/\/+$/, '').toLowerCase()
}

/** Map imagery layer → image server base layer. A title is kept editable. */
function toImageServerBaseLayer(layer: MapImageryLayer): IVisualBaseLayerConfig {
  return {
    ...DEFAULT_VISUAL_BASE_LAYER,
    url: layer.url,
    type: VisualBaseLayerType.ImageServer,
    position: undefined,
    visible: layer.visible,
    layerName: layer.name ?? '',
    layerNameLocked: !layer.name
  }
}

const VisualBaseLayerList = (props: VisualBaseLayerListProps) => {
  const { layers, onChange, mapId, useExistingMap = true } = props
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

  const handleUrlChange = useCallback((index: number, url: string, updates?: VisualBaseLayerUrlUpdate) => {
    const patch: Partial<IVisualBaseLayerConfig> = { url }
    if (updates && 'layerName' in updates) {
      patch.layerName = updates.layerName
    }
    if (updates?.type) {
      patch.type = updates.type
      // Image Server layers do not use a static image quad.
      if (updates.type === VisualBaseLayerType.ImageServer) {
        patch.position = undefined
      }
    }
    onChange(replaceAt(layers, index, patch))
  }, [layers, onChange])

  const handleToggleVisible = useCallback((index: number) => {
    const isVisible = layers[index]?.visible !== false
    onChange(replaceAt(layers, index, { visible: !isVisible }))
  }, [layers, onChange])

  const handleLayerNameLockChange = useCallback((index: number, locked: boolean, layerName: string | undefined) => {
    onChange(replaceAt(layers, index, { layerNameLocked: locked, layerName }))
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

  const handleListBaseLayers = useCallback(() => {
    const map = mapId
      ? getJimuMapViewById(mapId, MapViewManager.getInstance())?.view?.map
      : undefined
    if (!map) {
      return
    }

    const existingUrls = new Set(
      layers
        .map(layer => normalizeLayerUrl(layer.url))
        .filter((url): url is string => !!url)
    )
    const imported = getMapImageryLayers(map)
      .filter(layer => {
        const url = normalizeLayerUrl(layer.url)
        return !!url && !existingUrls.has(url)
      })
      .map(toImageServerBaseLayer)
    if (imported.length === 0) {
      return
    }

    onChange([...layers, ...imported])
    setIsOpen(true)
    setExpandedLayers(prev => {
      const next = { ...prev }
      imported.forEach((_, offset) => { next[layers.length + offset] = true })
      return next
    })
  }, [layers, mapId, onChange])

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
              onUrlChange={(url, updates) => handleUrlChange(index, url, updates)}
              onToggleVisible={() => handleToggleVisible(index)}
              onLayerNameLockChange={(locked, layerName) => handleLayerNameLockChange(index, locked, layerName)}
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

          {!useExistingMap ? (
            <Button
              type={ButtonType.Primary}
              style={{ width: '100%', marginBottom: 12 }}
              onClick={handleListBaseLayers}
            >
              {BUTTON_IMPORT}
            </Button>
          ) : null}
        </SettingRow>
      </Collapse>
    </div>
  )
}

export default VisualBaseLayerList
