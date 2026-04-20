import { React } from 'jimu-core'
import { NumericInput, Label, Tooltip } from 'jimu-ui'
import { VALIDATION } from '../validation/validation'
import { Colors, Padding } from '../enums'
import CopyButton from './CopyButton'
import LockToggle from './LockToggle'

const DEFAULT_LAT_LABEL = 'Lat'
const DEFAULT_LNG_LABEL = 'Lng'
const TOOLTIP_LOCK = 'Lock to sync with map'
const TOOLTIP_UNLOCK_TEMPLATE = (field: string) => `Unlock to edit ${field} manually`
const ICON_SIZE_LOCK = 12
const ICON_SIZE_COPY = 10

export interface CoordinateLockProps {
  locked: boolean
  onToggle: () => void
}

export interface CoordinatePairInputProps {
  /** Latitude value (shown first in UI) */
  latitude: number
  /** Longitude value (shown second in UI) */
  longitude: number
  /** Callback when latitude changes */
  onLatChange: (value: number) => void
  /** Callback when longitude changes */
  onLngChange: (value: number) => void
  /** Whether the lat input is disabled */
  latDisabled?: boolean
  /** Whether the lng input is disabled */
  lngDisabled?: boolean
  /** Optional lock props for latitude */
  latLock?: CoordinateLockProps
  /** Optional lock props for longitude */
  lngLock?: CoordinateLockProps
  /** Label for the latitude field (default: "Lat") */
  latLabel?: string
  /** Label for the longitude field (default: "Lng") */
  lngLabel?: string
  /** Whether to show copy buttons per field */
  showCopyButton?: boolean
  /** Compact mode — reduces spacing for use inside GeoQuadEditor */
  compact?: boolean
}

const sublabelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: Colors.TextMuted,
  marginBottom: 0,
  lineHeight: '16px'
}

const labelRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '4px',
  minHeight: '20px'
}

const iconGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '2px'
}

/**
 * A reusable coordinate pair input that renders latitude and longitude
 * side-by-side in a 2-column grid. UI always shows lat before lng.
 *
 * Optionally supports per-field lock/unlock toggles for map syncing,
 * per-field copy buttons, and value tooltips on hover.
 * Used by both the Center coordinate row and the GeoQuadEditor corners.
 */
const CoordinatePairInput = (props: CoordinatePairInputProps) => {
  const {
    latitude, longitude, onLatChange, onLngChange,
    latDisabled = false, lngDisabled = false,
    latLock, lngLock,
    latLabel = DEFAULT_LAT_LABEL, lngLabel = DEFAULT_LNG_LABEL,
    showCopyButton = false,
    compact = false
  } = props

  const gap = compact ? '4px' : Padding.ElementGap

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap, width: '100%' }}>
      <div>
        <div style={labelRowStyle}>
          <Label style={sublabelStyle}>{latLabel}</Label>
          <div style={iconGroupStyle}>
            {latLock && (
              <LockToggle
                locked={latLock.locked}
                onToggle={latLock.onToggle}
                unlockTooltip={TOOLTIP_UNLOCK_TEMPLATE('latitude')}
                lockTooltip={TOOLTIP_LOCK}
                iconSize={ICON_SIZE_LOCK}
              />
            )}
            {showCopyButton && (
              <CopyButton value={String(latitude)} ariaLabel="Copy latitude value" iconSize={ICON_SIZE_COPY} />
            )}
          </div>
        </div>
        <Tooltip title={String(latitude)} placement="bottom">
          <div>
            <NumericInput
              style={{ width: '100%' }}
              value={latitude}
              onChange={onLatChange}
              min={VALIDATION.LATITUDE_MIN}
              max={VALIDATION.LATITUDE_MAX}
              disabled={latDisabled}
              aria-label={latLabel}
            />
          </div>
        </Tooltip>
      </div>
      <div>
        <div style={labelRowStyle}>
          <Label style={sublabelStyle}>{lngLabel}</Label>
          <div style={iconGroupStyle}>
            {lngLock && (
              <LockToggle
                locked={lngLock.locked}
                onToggle={lngLock.onToggle}
                unlockTooltip={TOOLTIP_UNLOCK_TEMPLATE('longitude')}
                lockTooltip={TOOLTIP_LOCK}
                iconSize={ICON_SIZE_LOCK}
              />
            )}
            {showCopyButton && (
              <CopyButton value={String(longitude)} ariaLabel="Copy longitude value" iconSize={ICON_SIZE_COPY} />
            )}
          </div>
        </div>
        <Tooltip title={String(longitude)} placement="bottom">
          <div>
            <NumericInput
              style={{ width: '100%' }}
              value={longitude}
              onChange={onLngChange}
              min={VALIDATION.LONGITUDE_MIN}
              max={VALIDATION.LONGITUDE_MAX}
              disabled={lngDisabled}
              aria-label={lngLabel}
            />
          </div>
        </Tooltip>
      </div>
    </div>
  )
}

export default CoordinatePairInput

