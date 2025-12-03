/**
 * Map type for rendering sources
 */
export enum MapType {
  Travel = 'travel',
  Heatmap = 'heatmap',
  Indoor = 'indoor'
}

/**
 * Source loader type
 */
export enum SourceType {
  OSM = 'osm',
  TDEI = 'TDEI',
  ESRI = 'esri',
  GeoJSON = 'geojson'
}

/**
 * Interface for a single Audiom data source
 */
export interface IAudiomSource {
  /**
   * Source name or URL to GeoJSON data
   */
  source: string;

  /**
   * Override the source loader type
   */
  type?: SourceType | string;

  /**
   * Override the map rendering type for this source
   */
  mapType?: MapType;

  /**
   * Custom display name for the source
   */
  name?: string;

  /**
   * URL for dynamic sources (required for ESRI type)
   */
  url?: string;

  /**
   * Path to rules file for this source
   */
  rules?: string;

  /**
   * Additional custom parameters for the source
   */
  additionalParams?: Record<string, string | number | boolean>;
}

/**
 * Single Audiom data source configuration
 */
export class AudiomSource implements IAudiomSource {
  source: string;
  type?: SourceType | string;
  mapType?: MapType;
  name?: string;
  url?: string;
  rules?: string;
  additionalParams?: Record<string, string | number | boolean>;

  constructor(config: IAudiomSource) {
    this.source = config.source;
    this.type = config.type;
    this.mapType = config.mapType;
    this.name = config.name;
    this.url = config.url;
    this.rules = config.rules;
    this.additionalParams = config.additionalParams;
  }

  /**
   * Create a simple source by name (e.g., "osm", "TDEI")
   */
  static fromName(sourceName: string): AudiomSource {
    return new AudiomSource({ source: sourceName });
  }

  /**
   * Create a source from a GeoJSON URL
   */
  static fromGeoJsonUrl(url: string, name?: string): AudiomSource {
    return new AudiomSource({
      source: url,
      type: SourceType.GeoJSON,
      name
    });
  }

  /**
   * Create an ESRI feature service source
   */
  static fromEsri(config: {
    source: string;
    url: string;
    name?: string;
    mapType?: MapType;
    rules?: string;
  }): AudiomSource {
    return new AudiomSource({
      source: config.source,
      type: SourceType.ESRI,
      url: config.url,
      name: config.name,
      mapType: config.mapType,
      rules: config.rules
    });
  }

  /**
   * Convert to URL query parameters
   * Returns an object with namespaced parameters for multi-source configuration
   */
  toQueryParams(): Record<string, string> {
    const params: Record<string, string> = {};

    if (this.type) {
      params[`${this.source}.type`] = this.type;
    }
    if (this.mapType) {
      params[`${this.source}.mapType`] = this.mapType;
    }
    if (this.name) {
      params[`${this.source}.name`] = this.name;
    }
    if (this.url) {
      params[`${this.source}.url`] = this.url;
    }
    if (this.rules) {
      params[`${this.source}.rules`] = this.rules;
    }
    if (this.additionalParams) {
      Object.entries(this.additionalParams).forEach(([key, value]) => {
        params[`${this.source}.${key}`] = String(value);
      });
    }

    return params;
  }
}
