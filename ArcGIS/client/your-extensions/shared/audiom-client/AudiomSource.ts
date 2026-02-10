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
   * Where clause / definition expression to filter features
   */
  where?: string;

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
  where?: string;
  additionalParams?: Record<string, string | number | boolean>;

  /**
   * Returns a URL-friendly source identifier derived from the source name
   * with all whitespace removed. Falls back to the raw source ID if no name is set.
   */
  get sourceId(): string {
    return (this.name || this.source).replace(/\s+/g, '');
  }

  constructor(config: IAudiomSource) {
    this.source = config.source;
    this.type = config.type;
    this.mapType = config.mapType;
    this.name = config.name;
    this.url = config.url;
    this.rules = config.rules;
    this.where = config.where;
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
    where?: string;
  }): AudiomSource {
    return new AudiomSource({
      source: config.source,
      type: SourceType.ESRI,
      url: config.url,
      name: config.name,
      mapType: config.mapType,
      rules: config.rules,
      where: config.where
    });
  }

  /**
   * Convert to URL query parameters
   * Returns an object with namespaced parameters for multi-source configuration
   */
  toQueryParams(): Record<string, string> {
    const params: Record<string, string> = {};

    // Previously used raw source ID (e.g. ArcGIS layer ID like "19c44caef8d-layer-2")
    // as the query param prefix. Now uses whitespace-trimmed source name for cleaner URLs.
    // const prefix = this.source;
    const prefix = this.sourceId;

    if (this.type) {
      params[`${prefix}.type`] = this.type;
    }
    if (this.mapType) {
      params[`${prefix}.mapType`] = this.mapType;
    }
    if (this.name) {
      params[`${prefix}.name`] = this.name;
    }
    if (this.url) {
      params[`${prefix}.url`] = this.url;
    }
    if (this.rules) {
      params[`${prefix}.rules`] = this.rules;
    }
    if (this.where) {
      params[`${prefix}.where`] = this.where;
    }
    if (this.additionalParams) {
      Object.entries(this.additionalParams).forEach(([key, value]) => {
        params[`${prefix}.${key}`] = String(value);
      });
    }

    return params;
  }
}
