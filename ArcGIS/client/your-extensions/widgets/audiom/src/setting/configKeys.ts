export enum SourceConfigKey {
  Source = 'source',
  Name = 'name',
  SourceUrl = 'sourceUrl',
  RulesFileUrl = 'rulesFileUrl',
  MapType = 'mapType',
  Filters = 'filters',
  FiltersLocked = 'filtersLocked',
  Enabled = 'enabled',
  Locked = 'locked'
}

export enum AudiomConfigKey {
  ApiKey = 'apiKey',
  BaseUrl = 'baseUrl',
  Heading = 'heading',
  Title = 'title',
  TitleLocked = 'titleLocked',
  StepSize = 'stepSize',
  StepSizeUnit = 'stepSizeUnit',
  ShowVisualMap = 'showVisualMap',
  ShowHeading = 'showHeading',
  SoundpackUrl = 'soundpackUrl',
  VisualBaseLayers = 'visualBaseLayers',
  VisualStyle = 'visualStyle',
  SourceConfigs = 'sourceConfigs',
  CenterLatitude = 'centerLatitude',
  CenterLatitudeLocked = 'centerLatitudeLocked',
  CenterLongitude = 'centerLongitude',
  CenterLongitudeLocked = 'centerLongitudeLocked',
  Zoom = 'zoom',
  ZoomLocked = 'zoomLocked',
  UseExistingMap = 'useExistingMap',
  ExistingMapId = 'existingMapId',
  /** Portal item selected as Bundled mode's own map. Not a Map widget. */
  MapItemId = 'mapItemId',
  RuntimeLocation = 'runtimeLocation',
  AssetBaseUrl = 'assetBaseUrl'
}

/** Names of lockable fields that can sync with the map */
export enum LockableFieldName {
  Title = 'title',
  CenterLatitude = 'centerLatitude',
  CenterLongitude = 'centerLongitude',
  Zoom = 'zoom'
}
