/**
 * Centralized UI strings for the audiom widget.
 *
 * No real i18n is wired up yet — this file just removes the duplication of
 * tooltip / label / placeholder strings that previously lived inline in
 * each component, and gives a single surface to localize from later.
 *
 * Grouped by feature area for readability; everything is exported flat so
 * consumers just replace their inline constants with imports.
 */

// ─── Copy / clipboard ────────────────────────────────────────────────────────
export const TOOLTIP_COPY = 'Copy to clipboard'
export const TOOLTIP_COPIED = 'Copied!'

// ─── Lock / unlock ───────────────────────────────────────────────────────────
export const TOOLTIP_LOCK = 'Lock to sync with map'
/** Used for individually-lockable fields (latitude, longitude, title, zoom...). */
export const tooltipUnlockField = (field: string): string => `Unlock to edit ${field} manually`

// ─── Source card ─────────────────────────────────────────────────────────────
export const SOURCE_PREFIX = 'Source '
export const TOOLTIP_REMOVE_SOURCE = 'Remove source'
export const TOOLTIP_SHOW_SOURCE = 'Show source'
export const TOOLTIP_HIDE_SOURCE = 'Hide source'
export const TOOLTIP_UNLOCK_SOURCE_VISIBILITY = 'Unlock to manually control visibility'

export const FIELD_LABEL_NAME = 'Name'
export const FIELD_LABEL_SOURCE_URL = 'Source URL'
export const FIELD_LABEL_RULES_URL = 'Rules File URL'
export const FIELD_LABEL_SOURCE = 'Source'
export const FIELD_LABEL_MAP_TYPE = 'Map Type'
export const FIELD_LABEL_FILTER = 'Filters'

export const PLACEHOLDER_NAME = 'Enter source display name'
export const PLACEHOLDER_SOURCE_URL = 'Enter map source URL'
export const PLACEHOLDER_RULES_URL = 'Enter rules file URL'
export const PLACEHOLDER_SOURCE = 'Enter source identifier (e.g., units)'
export const PLACEHOLDER_FILTER = 'e.g., population > 1000'
export const PLACEHOLDER_TIME_FILTER = 'e.g., 2024-01-01/2024-12-31'

// ─── Per-filter row ──────────────────────────────────────────────────────────
export const TOOLTIP_LOCK_FILTER = 'Lock to sync filter from map'
export const TOOLTIP_UNLOCK_FILTER = 'Unlock to manually edit filter'
export const TOOLTIP_REMOVE_FILTER = 'Remove filter'
export const TOOLTIP_ADD_FILTER = 'Add filter'

// ─── Filter group (the "Filters" header on a source card) ────────────────────
export const TOOLTIP_LOCK_FILTERS = 'Lock filters to sync from map'
export const TOOLTIP_UNLOCK_FILTERS = 'Unlock to add/remove filters'

// ─── GeoQuad editor ──────────────────────────────────────────────────────────
export const HEADER_LABEL_LAYER_POSITION = 'Layer Position'
export const TEXT_PLACEHOLDER_GEOQUAD = '[[lng,lat],[lng,lat],[lng,lat],[lng,lat]]'
export const TOOLTIP_VISUAL_MODE = 'Switch to visual editor'
export const TOOLTIP_TEXT_MODE = 'Switch to text input'
export const TOOLTIP_COPY_POSITION = 'Copy position array'

// ─── Coordinate pair ─────────────────────────────────────────────────────────
export const DEFAULT_LAT_LABEL = 'Lat'
export const DEFAULT_LNG_LABEL = 'Lng'

// ─── Mixed value placeholder (used in list-level "all" inputs) ───────────────
export const MIXED_VALUE_PLACEHOLDER = '-'
