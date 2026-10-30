import { ServiceManager, geometryUtils, loadArcGISJSAPIModule } from 'jimu-core';
import { StepSize } from './StepSize';
import { AudiomSource, IAudiomSource } from './AudiomSource';
import { GeoQuad, type IGeoQuad } from './GeoQuad';
import { Coordinates } from './Coordinates';

/** Largest exportImage dimension that stays under common ImageServer limits. */
const EXPORT_IMAGE_MAX_SIZE = 4096;

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

// Type of base layer for visual map: either a static image overlay or an ArcGIS feature layer
export enum VisualBaseLayerType {
  // Static image overlay URL
  Image = 'image',
  
  // ArcGIS image feature layer
  Feature = 'feature'
}

/**
 * Visual base layer input. `position` may be a GeoQuad or a plain corner object.
 */
export interface IVisualBaseLayer {
  /** URL for the visual base layer image overlay */
  url: string;

  /** Base layer source.  Defaults to Image for backward compatibility. */
  type?: VisualBaseLayerType;

  /** Position quad for the visual base layer */
  position?: IGeoQuad;

  /** Whether the visual base layer is visible. Defaults to true. */
  visible?: boolean;
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
 * Audiom embedded map configuration.
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
    // Copy corners into GeoQuad instances so serialization always has toString().
    // JSON and Immutable records satisfy IGeoQuad but are not class instances.
    this.visualBaseLayers = config.visualBaseLayers?.map(layer => ({
      url: layer.url,
      type: layer.type,
      position: layer.position ? GeoQuad.from(layer.position) : undefined,
      visible: layer.visible
    }));
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
   * Convert configuration to query parameters as key-value pairs.
   * ImageServer feature layers are passed through unchanged. Call
   * {@link resolveVisualBaseLayers} first when those layers should become
   * exportable image URLs.
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
   * Replace ImageServer feature layers with a public exportImage URL and a
   * geographic position. Static image layers are left unchanged. Layers that
   * cannot be exported are omitted rather than passed through as service URLs.
   */
  async resolveVisualBaseLayers(): Promise<void> {
    if (!this.visualBaseLayers?.length) {
      return;
    }

    const resolved: IVisualBaseLayer[] = [];

    for (const layer of this.visualBaseLayers) {

      // ignore layers that are not visible
      if(layer.visible === false) {
        continue;
      }

      // Image layers are already resolved, so just copy them
      if ((layer.type ?? VisualBaseLayerType.Image) !== VisualBaseLayerType.Feature) {
        resolved.push(layer);
        continue;
      }

      // convert ImageServer layers to images 
      const imageLayer = await resolveImageServiceLayer(layer);
      if (imageLayer) {
        resolved.push(imageLayer);
      }
    }
    this.visualBaseLayers = resolved;
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

interface ServiceExtent {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  spatialReference?: { wkid?: number; latestWkid?: number; wkt?: string };
}

interface ImageServiceDefinition {
  extent?: ServiceExtent;
  spatialReference?: ServiceExtent['spatialReference'];
  capabilities?: string;
  pixelSizeX?: number;
  pixelSizeY?: number;
  maxImageWidth?: number;
  maxImageHeight?: number;
}

/**
 * Turn an ImageServer URL into a static overlay the embed can fetch.
 * `capabilities` is not a reliable Export Image signal, so a small export is
 * probed. The returned URL is public; a blob URL cannot cross into the iframe.
 */
async function resolveImageServiceLayer(layer: IVisualBaseLayer): Promise<IVisualBaseLayer | undefined> {
  const serviceUrl = layer.url.replace(/\/+$/, '');
  if (!/\/ImageServer$/i.test(serviceUrl)) {
    return undefined;
  }

  let info: { definition?: ImageServiceDefinition };
  try {
    info = await ServiceManager.getInstance().fetchServiceInfo(serviceUrl);
  } catch {
    return undefined;
  }

  const definition = info?.definition;
  const extent = definition?.extent;
  if (!isExtent(extent)) {
    return undefined;
  }

  const wkid = extent.spatialReference?.latestWkid
    ?? extent.spatialReference?.wkid
    ?? definition?.spatialReference?.latestWkid
    ?? definition?.spatialReference?.wkid;
  if (!wkid) {
    return undefined;
  }

  const exportUrl = buildExportImageUrl(serviceUrl, extent, wkid, definition);
  if (!await canExportImage(exportUrl)) {
    return undefined;
  }

  const position = await extentToGeoQuad(extent, wkid);
  if (!position) {
    return undefined;
  }

  return {
    url: exportUrl,
    type: VisualBaseLayerType.Image,
    position
  };
}

function positive(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function isExtent(extent: ServiceExtent | null | undefined): extent is ServiceExtent {
  return !!extent
    && Number.isFinite(extent.xmin)
    && Number.isFinite(extent.ymin)
    && Number.isFinite(extent.xmax)
    && Number.isFinite(extent.ymax)
    && extent.xmax > extent.xmin
    && extent.ymax > extent.ymin;
}

function buildExportImageUrl(
  serviceUrl: string,
  extent: ServiceExtent,
  wkid: number,
  definition?: ImageServiceDefinition
): string {
  const pixelSizeX = positive(definition?.pixelSizeX) ?? 1;
  const pixelSizeY = positive(definition?.pixelSizeY) ?? pixelSizeX;
  const maxWidth = Math.min(positive(definition?.maxImageWidth) ?? EXPORT_IMAGE_MAX_SIZE, EXPORT_IMAGE_MAX_SIZE);
  const maxHeight = Math.min(positive(definition?.maxImageHeight) ?? EXPORT_IMAGE_MAX_SIZE, EXPORT_IMAGE_MAX_SIZE);
  const sourceWidth = (extent.xmax - extent.xmin) / pixelSizeX;
  const sourceHeight = (extent.ymax - extent.ymin) / pixelSizeY;
  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
  const size = `${Math.max(1, Math.round(sourceWidth * scale))},${Math.max(1, Math.round(sourceHeight * scale))}`;
  const params = new URLSearchParams({
    bbox: `${extent.xmin},${extent.ymin},${extent.xmax},${extent.ymax}`,
    bboxSR: String(wkid),
    imageSR: String(wkid),
    size,
    format: 'png',
    f: 'image'
  });
  return `${serviceUrl}/exportImage?${params.toString()}`;
}

/** Confirm the operation returns an image. A JSON error body means it does not. */
async function canExportImage(exportUrl: string): Promise<boolean> {
  const probe = new URL(exportUrl);
  probe.searchParams.set('size', '64,64');
  probe.searchParams.set('f', 'json');
  try {
    const response = await fetch(probe.toString());
    if (!response.ok) {
      return false;
    }
    const body = await response.json() as { href?: string; error?: unknown };
    return typeof body.href === 'string' && !body.error;
  } catch {
    return false;
  }
}

const GEOGRAPHIC_WKIDS = new Set([4326, 4269]);

/**
 * Overlay corners are longitude/latitude. Geographic extents are used directly.
 * Projected extents are converted with the ArcGIS projection engine.
 */
async function extentToGeoQuad(extent: ServiceExtent, wkid: number): Promise<GeoQuad | undefined> {
  const corners = [
    [extent.xmin, extent.ymax],
    [extent.xmax, extent.ymax],
    [extent.xmax, extent.ymin],
    [extent.xmin, extent.ymin]
  ];
  if (GEOGRAPHIC_WKIDS.has(wkid)) {
    return GeoQuad.fromArray(corners);
  }

  try {
    const [Point, SpatialReference] = await Promise.all([
      loadArcGISJSAPIModule('esri/geometry/Point'),
      loadArcGISJSAPIModule('esri/geometry/SpatialReference')
    ]) as [
      new (properties: { x: number; y: number; spatialReference: unknown }) => __esri.Geometry,
      new (properties: { wkid: number }) => __esri.SpatialReference
    ];
    const source = new SpatialReference({ wkid });
    const projected = await geometryUtils.projectToSpatialReference(
      corners.map(([x, y]) => new Point({ x, y, spatialReference: source })),
      new SpatialReference({ wkid: 4326 })
    );
    const geographic = projected.map(point => {
      const { x, y } = point as __esri.Geometry & { x?: number; y?: number };
      return [x, y];
    });
    if (geographic.some(([lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat))) {
      return undefined;
    }
    return GeoQuad.fromArray(geographic as number[][]);
  } catch {
    return undefined;
  }
}
