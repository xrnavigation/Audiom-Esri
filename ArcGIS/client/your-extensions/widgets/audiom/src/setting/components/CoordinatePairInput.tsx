import { React, css } from 'jimu-core'
import { NumericInput, Label, Button, Tooltip } from 'jimu-ui'
import { LockOutlined } from 'jimu-icons/outlined/editor/lock'
import { UnlockOutlined } from 'jimu-icons/outlined/editor/unlock'
import { CopyOutlined } from 'jimu-icons/outlined/editor/copy'
import { VALIDATION } from '../validation/validation'
import { ButtonSize, ButtonType, Colors } from '../enums'
import { Padding } from '../paddings'

const { useState, useCallback } = React

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

const TOOLTIP_COPY = 'Copy to clipboard'
const TOOLTIP_COPIED = 'Copied!'
const TOOLTIP_RESET_DELAY = 1000

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

const lockButtonStyle = css({
  padding: '2px',
  minWidth: 'auto',
  background: 'transparent',
  border: 'none'
})

const copyButtonStyle = css({
  padding: '2px',
  background: Colors.Transparent,
  border: 'none',
  cursor: 'pointer',
  color: Colors.TextMuted,
  opacity: 0.6,
  transition: 'opacity 0.15s ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '&:hover': {
    opacity: 1
  }
})

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
    latLabel = 'Lat', lngLabel = 'Lng',
    showCopyButton = false,
    compact = false
  } = props

  const [copiedField, setCopiedField] = useState<'lat' | 'lng' | null>(null)

  const handleCopy = useCallback(async (field: 'lat' | 'lng', value: number) => {
    try {
      await navigator.clipboard.writeText(String(value))
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), TOOLTIP_RESET_DELAY)
    } catch { /* ignore */ }
  }, [])

  const gap = compact ? '4px' : Padding.ElementGap

  const renderLockButton = (lock: CoordinateLockProps, fieldLabel: string) => {
    const tooltip = lock.locked
      ? `Unlock to edit ${fieldLabel.toLowerCase()} manually`
      : `Lock to sync with map`
    return (
      <Tooltip title={tooltip}>
        <Button
          type={ButtonType.Tertiary}
          size={ButtonSize.Small}
          onClick={lock.onToggle}
          aria-label={lock.locked ? `Unlock ${fieldLabel}` : `Lock ${fieldLabel}`}
          css={lockButtonStyle}
        >
          {lock.locked ? <LockOutlined size={12} /> : <UnlockOutlined size={12} />}
        </Button>
      </Tooltip>
    )
  }

  const renderCopyButton = (field: 'lat' | 'lng', value: number) => {
    const isCopied = copiedField === field
    return (
      <Tooltip title={isCopied ? TOOLTIP_COPIED : TOOLTIP_COPY} placement="top">
        <button
          type="button"
          onClick={() => handleCopy(field, value)}
          aria-label={`Copy ${field === 'lat' ? 'latitude' : 'longitude'} value`}
          css={copyButtonStyle}
        >
          <CopyOutlined size={10} color={isCopied ? Colors.Success : undefined} />
        </button>
      </Tooltip>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap, width: '100%' }}>
      <div>
        <div style={labelRowStyle}>
          <Label style={sublabelStyle}>{latLabel}</Label>
          <div style={iconGroupStyle}>
            {latLock && renderLockButton(latLock, 'latitude')}
            {showCopyButton && renderCopyButton('lat', latitude)}
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
            {lngLock && renderLockButton(lngLock, 'longitude')}
            {showCopyButton && renderCopyButton('lng', longitude)}
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
