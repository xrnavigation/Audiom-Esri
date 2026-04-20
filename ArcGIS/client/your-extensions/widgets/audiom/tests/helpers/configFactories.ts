/**
 * Factories for building IAudiomConfig / ISourceConfig / IFilterConfig
 * test fixtures with sensible defaults.
 *
 * Why a factory: the production types have a lot of optional properties
 * and overlapping defaults sourced from DEFAULT_CONFIG. Hand-rolling them
 * in every test is noisy and easy to get wrong.
 */
import { Immutable } from 'jimu-core'
import { DEFAULT_CONFIG, IAudiomConfig, ISourceConfig, IFilterConfig } from '../../src/setting/configs'
import { FilterType } from '../../src/setting/enums'
import { MapType } from '../../../../shared/audiom-client/AudiomSource'

/** Build a plain (mutable) IAudiomConfig for unit tests of pure utilities. */
export function makeConfig(overrides: Partial<IAudiomConfig> = {}): IAudiomConfig {
  return {
    apiKey: 'test-api-key',
    baseUrl: DEFAULT_CONFIG.baseUrl,
    title: 'Test Map',
    centerLatitude: DEFAULT_CONFIG.centerLatitude,
    centerLongitude: DEFAULT_CONFIG.centerLongitude,
    zoom: DEFAULT_CONFIG.zoom,
    stepSize: DEFAULT_CONFIG.stepSize,
    stepSizeUnit: DEFAULT_CONFIG.stepSizeUnit,
    showVisualMap: DEFAULT_CONFIG.showVisualMap,
    showHeading: DEFAULT_CONFIG.showHeading,
    useExistingMap: false,
    titleLocked: DEFAULT_CONFIG.titleLocked,
    centerLatitudeLocked: DEFAULT_CONFIG.centerLatitudeLocked,
    centerLongitudeLocked: DEFAULT_CONFIG.centerLongitudeLocked,
    zoomLocked: DEFAULT_CONFIG.zoomLocked,
    sourceConfigs: [],
    ...overrides
  }
}

/**
 * Build an ImmutableObject IAudiomConfig — what the widget actually
 * receives at runtime via props.config. The framework wraps every
 * widget config in `Immutable()` so tests that exercise the React
 * components / hooks must do the same.
 */
export function makeImmutableConfig(overrides: Partial<IAudiomConfig> = {}): IAudiomConfig {
  return Immutable.from(makeConfig(overrides)) as unknown as IAudiomConfig
}

export function makeSource(overrides: Partial<ISourceConfig> = {}): ISourceConfig {
  return {
    source: 'src-1',
    name: 'Source 1',
    sourceUrl: 'https://example.com/layer/0',
    mapType: MapType.Indoor,
    filters: [],
    filtersLocked: true,
    enabled: true,
    locked: true,
    ...overrides
  }
}

export function makeFilter(overrides: Partial<IFilterConfig> = {}): IFilterConfig {
  return {
    expression: 'pop > 100',
    mapExpression: 'pop > 100',
    filterType: FilterType.Where,
    mapFilterType: FilterType.Where,
    locked: true,
    fromMap: true,
    ...overrides
  }
}
