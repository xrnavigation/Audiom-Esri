import { React } from 'jimu-core'
import { Label, Collapse } from 'jimu-ui'
import CoordinatePairInput from './CoordinatePairInput'
import CollapsibleHeader from './CollapsibleHeader'
import { Colors } from '../enums'
import { Padding } from '../paddings'

const { useState } = React

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

/**
 * A structured editor for GeoQuad (4-corner geographic rectangle).
 * Renders a collapsible 2×2 grid of CoordinatePairInputs, one per corner.
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

  const corners = parseCorners(value)
  // corners: [TL, TR, BR, BL] — matches GeoQuad array order

  const updateCorner = (index: number, field: 'lat' | 'lng', newValue: number) => {
    const updated = [...corners] as [Corner, Corner, Corner, Corner]
    updated[index] = { ...updated[index], [field]: newValue }
    onChange(serializeCorners(updated))
  }

  // Visual layout: top row = TL(0), TR(1); bottom row = BL(3), BR(2)
  const layout = [
    { label: 'Top Left', index: 0 },
    { label: 'Top Right', index: 1 },
    { label: 'Bottom Left', index: 3 },
    { label: 'Bottom Right', index: 2 }
  ]

  return (
    <div style={{ width: '100%' }}>
      <CollapsibleHeader
        label="Visual Base Layer Position"
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
      />
      <Collapse isOpen={isOpen}>
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
      </Collapse>
    </div>
  )
}

export default GeoQuadEditor
