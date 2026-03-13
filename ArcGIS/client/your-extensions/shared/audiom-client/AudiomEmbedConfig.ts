import { StepSize } from './StepSize';
import { AudiomSource, IAudiomSource } from './AudiomSource';
import { GeoQuad } from './GeoQuad';
import { Coordinates } from './Coordinates';

/**
 * Visual style options for map rendering
 */
export enum VisualStyle {
  Geology = 'geology',
  Indoor = 'indoor',
  Outdoor = 'outdoor',
  Travel = 'travel'
}

/**
 * Filter mode for map feature filtering
 */
export enum FilterMode {
  /** Filters apply to all features everywhere */
  Global = 'global',
  /** Filters apply to menus and sonar scans only */
  Scan = 'scan'
}

/**
 * Visual base layer configuration
 */
export interface IVisualBaseLayer {
  /** URL for the visual base layer image overlay */
  url: string;
  /** Position quad for the visual base layer */
  position?: GeoQuad;
}

/**
 * Configuration interface for Audiom embedded map
 */
export interface IAudiomEmbedConfig {
  /**
   * Embed ID - numeric for static maps, "dynamic" for dynamic maps
   */
  embedId: string | number;

  /**
   * API key for fetching map data (Required)
   */
  apiKey: string;

  /**
   * Data source(s) for the map
   * Can be a single source or array of sources
   */
  sources?: IAudiomSource[] | string[];

  /**
   * Map center coordinates [longitude, latitude]
   * Takes precedence over separate latitude/longitude
   */
  center?: Coordinates;

  /**
   * Latitude for map center (used if center is not provided)
   */
  latitude?: number;

  /**
   * Longitude for map center (used if center is not provided)
   */
  longitude?: number;

  /**
   * Initial zoom level
   */
  zoom?: number;

  /**
   * Soundpack identifier or path
   */
  soundpack?: string;

  /**
   * Enable demo mode
   */
  demo?: boolean;

  /**
   * Custom title for the map
   */
  title?: string;

  /**
   * Show visual map component
   */
  showVisualMap?: boolean;

  /**
   * HTML heading level (1-6)
   */
  heading?: 1 | 2 | 3 | 4 | 5 | 6;

  /**
   * Show heading element
   */
  showHeading?: boolean;

  /**
   * Step size for navigation
   */
  stepSize?: StepSize | string;

  /**
   * Comma-separated list of object types to filter map features
   */
  filters?: string[];

  /**
   * Controls how filters are applied
   * @default FilterMode.Scan
   */
  filterMode?: FilterMode;

  /**
   * Visual rendering style
   */
  visualStyle?: VisualStyle;

  /**
   * Visual base layer image overlays with optional positioning
   */
  visualBaseLayers?: IVisualBaseLayer[];

  /**
   * Origins allowed to send messages via the PostMessage API.
   * Set to '*' to allow any origin (development only).
   * The PostMessage API is disabled by default.
   */
  allowedOrigins?: string[] | string;

  /**
   * Additional custom parameters
   */
  additionalParams?: Record<string, string | number | boolean>;
}

/**
 * Audiom embedded map configuration
 */
export class AudiomEmbedConfig implements IAudiomEmbedConfig {
  embedId: string | number;
  apiKey: string;
  sources?: AudiomSource[];
  center?: Coordinates;
  latitude?: number;
  longitude?: number;
  zoom?: number;
  soundpack?: string;
  demo?: boolean;
  title?: string;
  showVisualMap?: boolean;
  heading?: 1 | 2 | 3 | 4 | 5 | 6;
  showHeading?: boolean;
  stepSize?: StepSize;
  filters?: string[];
  filterMode?: FilterMode;
  visualStyle?: VisualStyle;
  visualBaseLayers?: IVisualBaseLayer[];
  allowedOrigins?: string[] | string;
  additionalParams?: Record<string, string | number | boolean>;

  /**
   * Default base URL for Audiom API
   */
  static defaultBaseURL = 'https://audiom-staging.herokuapp.com';

  constructor(config: IAudiomEmbedConfig) {
    // Required
    this.embedId = config.embedId;
    this.apiKey = config.apiKey;

    // Sources
    if (config.sources) {
      this.sources = config.sources.map(source => 
        typeof source === 'string' 
          ? AudiomSource.fromName(source)
          : new AudiomSource(source)
      );
    }

    // Location
    this.center = config.center;
    this.latitude = config.latitude;
    this.longitude = config.longitude;

    // Map settings
    this.zoom = config.zoom;
    this.soundpack = config.soundpack;
    this.demo = config.demo;
    this.title = config.title;
    this.showVisualMap = config.showVisualMap;
    this.heading = config.heading;
    this.showHeading = config.showHeading;

    // Step size
    if (config.stepSize) {
      this.stepSize = typeof config.stepSize === 'string'
        ? StepSize.parse(config.stepSize)
        : config.stepSize;
    }

    this.filters = config.filters;
    this.filterMode = config.filterMode;
    this.visualStyle = config.visualStyle;
    this.visualBaseLayers = config.visualBaseLayers;
    this.allowedOrigins = config.allowedOrigins;
    this.additionalParams = config.additionalParams;
  }

  /**
   * Create a dynamic embed configuration
   */
  static dynamic(config: Omit<IAudiomEmbedConfig, 'embedId'>): AudiomEmbedConfig {
    return new AudiomEmbedConfig({
      ...config,
      embedId: 'dynamic'
    });
  }

  /**
   * Create a static embed configuration with a numeric ID
   */
  static static(embedId: number, apiKey: string, additionalConfig?: Partial<IAudiomEmbedConfig>): AudiomEmbedConfig {
    return new AudiomEmbedConfig({
      embedId,
      apiKey,
      ...additionalConfig
    });
  }

  /**
   * Convert configuration to query parameters as key-value pairs
   */
  toQueryParams(): Record<string, string> {
    const params: Record<string, string> = {};

    // Required
    params.apiKey = this.apiKey;

    // Sources
    if (this.sources && this.sources.length > 0) {
      const sourceNames = this.sources.map(s => s.source).join(',');

      const sourceKey = "sources"
      params[sourceKey] = sourceNames;

      // Add source-specific parameters
      this.sources.forEach(source => {
        const sourceParams = source.toQueryParams();
        Object.assign(params, sourceParams);
      });
    }

    // Center coordinates (takes precedence)
    if (this.center) {
      params.center = this.center.toString();
    } else {
      // Fallback to latitude/longitude
      if (this.latitude !== undefined) {
        params.latitude = String(this.latitude);
      }
      if (this.longitude !== undefined) {
        params.longitude = String(this.longitude);
      }
    }

    // Optional parameters
    if (this.title) {
      params.title = this.title;
    }
    if (this.zoom !== undefined) {
      params.zoom = String(this.zoom);
    }
    if (this.soundpack) {
      params.soundpack = this.soundpack;
    }
    if (this.demo !== undefined) {
      params.demo = String(this.demo);
    }
    if (this.showVisualMap !== undefined) {
      params.showVisualMap = String(this.showVisualMap);
    }
    if (this.heading !== undefined) {
      params.heading = String(this.heading);
    }
    if (this.showHeading !== undefined) {
      params.showHeading = String(this.showHeading);
    }
    if (this.stepSize) {
      params.stepsize = this.stepSize.toString();
    }
    if (this.filters && this.filters.length > 0) {
      params.filters = this.filters.join(',');
    }
    if (this.filterMode) {
      params.filterMode = this.filterMode;
    }
    if (this.visualStyle) {
      params.visualStyle = this.visualStyle;
    }
    if (this.visualBaseLayers && this.visualBaseLayers.length > 0) {
      this.visualBaseLayers.forEach((layer, index) => {
        params[`visualbaselayer${index}`] = layer.url;
        if (layer.position) {
          params[`visualbaselayerposition${index}`] = layer.position.toString();
        }
      });
    }
    if (this.allowedOrigins) {
      params.allowedOrigins = Array.isArray(this.allowedOrigins)
        ? this.allowedOrigins.join(',')
        : this.allowedOrigins;
    }

    // Additional custom parameters
    if (this.additionalParams) {
      Object.entries(this.additionalParams).forEach(([key, value]) => {
        params[key] = String(value);
      });
    }

    return params;
  }

  /**
   * Generate the complete embed URL
   */
  toUrl(baseUrl: string = AudiomEmbedConfig.defaultBaseURL): string {
    const params = this.toQueryParams();
    const queryString = Object.entries(params)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');

    return `${baseUrl}/embed/${this.embedId}?${queryString}`;
  }

  /** 
   * Generate an embed URL with custom base URL
   */
  toUrlWithBase(baseUrl: string): string {
    return this.toUrl(baseUrl);
  }
}
