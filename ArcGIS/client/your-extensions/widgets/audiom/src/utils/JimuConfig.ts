/**
 * Utility functions for detecting Experience Builder environment.
 * 
 * Note: We use type assertion to access window.jimuConfig because
 * jimu-core already declares the global JimuConfig type. Adding our own
 * global Window declaration causes TypeScript conflicts.
 * 
 * The jimuConfig object is populated by the ArcGIS Experience Builder framework
 * at runtime from the webpack-options script tag in the HTML.
 */

/**
 * Complete interface for window.jimuConfig as provided by Experience Builder.
 * These can be seen by the browser dev tools when inspecting the window object.
 * All properties are guaranteed to be present (non-optional).
 */
interface IJimuConfig {
  /** Folder name for the app (e.g., "experience") */
  appFolderName: string
  
  /** URL to ArcGIS JS API */
  arcgisJsApiUrl: string
  
  /** Base URL for the application */
  baseUrl: string
  
  /** Build number (empty string in dev) */
  buildNumber: string
  
  /** URL to Calcite Components library */
  calciteComponentsUrl: string
  
  /** URL to Charts Components library */
  chartsComponentsUrl: string
  
  /** URL to Coding Components library */
  codingComponentsUrl: string
  
  /** Array of locale codes to download, or null */
  downloadLocales: string[] | null
  
  /** Experience Builder version (e.g., "1.19.0") */
  exbVersion: string
  
  /** Host environment ("prod", "dev", etc.) */
  hostEnv: string
  
  /** True when in Experience Builder edit/design mode */
  isBuilder: boolean
  
  /** True when running Developer Edition */
  isDevEdition: boolean
  
  /** True when in Experience Builder iframe (alternative check for builder mode) */
  isInBuilder: boolean
  
  /** True when running in ArcGIS Enterprise Portal */
  isInPortal: boolean
  
  /** True when app is hosted outside Experience Builder */
  isOutOfExb: boolean
  
  /** True when app is a Site page */
  isSite: boolean
  
  /** URL to Map Components library */
  mapComponentsUrl: string
  
  /** Mount path for the application */
  mountPath: string
  
  /** URL to Portal Components library */
  portalComponentsUrl: string
  
  /** Root path for the application */
  rootPath: string
  
  /** True when using structural URLs (clean URLs) instead of query params */
  useStructuralUrl: boolean
}

/**
 * Singleton class to access ArcGIS Experience Builder configuration.
 * Provides type-safe access to window.jimuConfig properties.
 */
export class JimuConfig {
  private static instance: JimuConfig | null = null
  private config: IJimuConfig

  private constructor() {
    this.config = (window as unknown as { jimuConfig: IJimuConfig }).jimuConfig
  }

  /**
   * Get the singleton instance of JimuConfig.
   */
  static getInstance(): JimuConfig {
    if (!JimuConfig.instance) {
      JimuConfig.instance = new JimuConfig()
    }
    return JimuConfig.instance
  }

  /**
   * Get the complete jimuConfig object.
   */
  getConfig(): IJimuConfig {
    return this.config
  }

  /**
   * Check if the current environment is Experience Builder (design mode).
   * Returns true when editing in the builder, false when viewing a deployed/preview app.
   */
  isInBuilder(): boolean {
    return this.config.isBuilder === true || this.config.isInBuilder === true
  }

  /**
   * Check if the current environment is a deployed/preview app (runtime mode).
   */
  isInRuntime(): boolean {
    return !this.isInBuilder()
  }

  /**
   * Check if running in Developer Edition.
   */
  isDevEdition(): boolean {
    return this.config.isDevEdition === true
  }

  /**
   * Check if running in ArcGIS Enterprise Portal.
   */
  isInPortal(): boolean {
    return this.config.isInPortal === true
  }

  /**
   * Check if this is a Site page.
   */
  isSite(): boolean {
    return this.config.isSite === true
  }

  /**
   * Get the Experience Builder version.
   */
  getVersion(): string {
    return this.config.exbVersion
  }

  /**
   * Get the base URL for the application.
   */
  getBaseUrl(): string {
    return this.config.baseUrl
  }

  /**
   * Get the mount path for the application.
   */
  getMountPath(): string {
    return this.config.mountPath
  }

  /**
   * Get the ArcGIS JS API URL.
   */
  getArcGISJsApiUrl(): string {
    return this.config.arcgisJsApiUrl
  }
}

// Export singleton instance and convenience functions
export const jimuConfig = JimuConfig.getInstance()
