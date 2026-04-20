import { React, css } from 'jimu-core'
import { Label, Collapse, TextInput, Button, Tooltip } from 'jimu-ui'
import CoordinatePairInput from './CoordinatePairInput'
import CollapsibleHeader from './CollapsibleHeader'
import CopyButton from './CopyButton'
import { ButtonSize, ButtonType, Colors, Padding } from '../enums'
import {
  HEADER_LABEL_LAYER_POSITION as HEADER_LABEL,
  TEXT_PLACEHOLDER_GEOQUAD as TEXT_PLACEHOLDER,
  TOOLTIP_VISUAL_MODE,
  TOOLTIP_TEXT_MODE,
  TOOLTIP_COPY_POSITION
} from '../strings'

const { useState } = React

const ICON_VISUAL = '⊞'
const ICON_TEXT = '{ }'

const CORNER_LABELS = {
  TOP_LEFT: 'Top Left',
  TOP_RIGHT: 'Top Right',
  BOTTOM_LEFT: 'Bottom Left',
  BOTTOM_RIGHT: 'Bottom Right'
} as const

export interface GeoQuadEditorProps {
  /** Serialized GeoQuad string: "[[lng,lat],[lng,lat],[lng,lat],[lng,lat]]" (TL, TR, BR, BL) */
  value: string
  /** Callback with the updated serialized GeoQuad string */
  onChange: (value: string) => void
  /** Whether the editor is disabled */
  disabled?: boolean
}

interface Corner {
  lat: number
  lng: number
}

const EMPTY_CORNER: Corner = { lat: 0, lng: 0 }

/** Parse a serialized GeoQuad string into 4 corners (TL, TR, BR, BL) */
function parseCorners(value: string): [Corner, Corner, Corner, Corner] {
  if (!value || !value.trim()) {
    return [{ ...EMPTY_CORNER }, { ...EMPTY_CORNER }, { ...EMPTY_CORNER }, { ...EMPTY_CORNER }]
  }
  try {
    const arr = JSON.parse(value)
    if (!Array.isArray(arr) || arr.length !== 4) {
      return [{ ...EMPTY_CORNER }, { ...EMPTY_CORNER }, { ...EMPTY_CORNER }, { ...EMPTY_CORNER }]
    }
    return arr.map((pair: number[]) => ({
      lat: pair?.[1] ?? 0,
      lng: pair?.[0] ?? 0
    })) as [Corner, Corner, Corner, Corner]
  } catch {
    return [{ ...EMPTY_CORNER }, { ...EMPTY_CORNER }, { ...EMPTY_CORNER }, { ...EMPTY_CORNER }]
  }
}

/** Serialize 4 corners back to GeoQuad string (data order: [lng, lat]) */
function serializeCorners(corners: [Corner, Corner, Corner, Corner]): string {
  return JSON.stringify(corners.map(c => [c.lng, c.lat]))
}

const cornerLabelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: Colors.TextMuted,
  marginBottom: '2px',
  fontWeight: 600
}

const quadContainerStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: Padding.ElementGap,
  width: '100%',
  padding: Padding.ElementGap,
  border: `1px solid var(--ref-palette-neutral-400, #d1d5db)`,
  borderRadius: '4px'
}

const modeButtonStyle = css({
  fontSize: '11px',
  padding: '0 4px',
  minWidth: 'auto',
  lineHeight: '20px'
})

/**
 * A structured editor for GeoQuad (4-corner geographic rectangle).
 * Supports two modes:
 * - UI mode: collapsible 2×2 grid of CoordinatePairInputs
 * - Text mode: raw JSON string input
 *
 * Corner order matches GeoQuad: TL, TR, BR, BL.
 * Layout visually represents the rectangle:
 *   TL --- TR
 *   |       |
 *   BL --- BR
 */
const GeoQuadEditor = (props: GeoQuadEditorProps) => {
  const { value, onChange, disabled = false } = props
  const [isOpen, setIsOpen] = useState(false)
  const [textMode, setTextMode] = useState(false)

  const corners = parseCorners(value)
  // corners: [TL, TR, BR, BL] — matches GeoQuad array order

  const updateCorner = (index: number, field: 'lat' | 'lng', newValue: number) => {
    const updated = [...corners] as [Corner, Corner, Corner, Corner]
    updated[index] = { ...updated[index], [field]: newValue }
    onChange(serializeCorners(updated))
  }

  // Visual layout: top row = TL(0), TR(1); bottom row = BL(3), BR(2)
  const layout = [
    { label: CORNER_LABELS.TOP_LEFT, index: 0 },
    { label: CORNER_LABELS.TOP_RIGHT, index: 1 },
    { label: CORNER_LABELS.BOTTOM_LEFT, index: 3 },
    { label: CORNER_LABELS.BOTTOM_RIGHT, index: 2 }
  ]

  const headerActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {value && (
        <CopyButton
          value={value || ''}
          ariaLabel={TOOLTIP_COPY_POSITION}
          stopPropagation
        />
      )}
      <Tooltip title={textMode ? TOOLTIP_VISUAL_MODE : TOOLTIP_TEXT_MODE}>
        <Button
          type={ButtonType.Tertiary}
          size={ButtonSize.Small}
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); setTextMode(!textMode) }}
          aria-label={textMode ? TOOLTIP_VISUAL_MODE : TOOLTIP_TEXT_MODE}
          css={modeButtonStyle}
        >
          {textMode ? ICON_VISUAL : ICON_TEXT}
        </Button>
      </Tooltip>
    </div>
  )

  return (
    <div style={{ width: '100%' }}>
      <CollapsibleHeader
        label={HEADER_LABEL}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        actions={headerActions}
      />
      <Collapse isOpen={isOpen}>
        {textMode ? (
          <TextInput
            style={{ width: '100%', marginBottom: Padding.ElementGap }}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={TEXT_PLACEHOLDER}
            disabled={disabled}
            aria-label={`${HEADER_LABEL} (raw)`}
          />
        ) : (
          <div style={quadContainerStyle}>
            {layout.map(({ label, index }) => (
              <div key={label}>
                <Label style={cornerLabelStyle}>{label}</Label>
                <CoordinatePairInput
                  compact
                  showCopyButton
                  latitude={corners[index].lat}
                  longitude={corners[index].lng}
                  onLatChange={(val) => updateCorner(index, 'lat', val)}
                  onLngChange={(val) => updateCorner(index, 'lng', val)}
                  latDisabled={disabled}
                  lngDisabled={disabled}
                />
              </div>
            ))}
          </div>
        )}
      </Collapse>
    </div>
  )
}

export default GeoQuadEditor
