export enum FieldConfigKey {
  Key = 'key',
  Label = 'label',
  Type = 'type',
  Placeholder = 'placeholder',
  Min = 'min',
  Max = 'max',
  DefaultValue = 'defaultValue',
  ShowWhen = 'showWhen',
  EnumOptions = 'enumOptions'
}

export enum SourceConfigKey {
  Source = 'source',
  Name = 'name',
  SourceUrl = 'sourceUrl',
  RulesFileUrl = 'rulesFileUrl',
  MapType = 'mapType',
  Where = 'where',
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
  SourceConfigs = 'sourceConfigs',
  CenterLatitude = 'centerLatitude',
  CenterLatitudeLocked = 'centerLatitudeLocked',
  CenterLongitude = 'centerLongitude',
  CenterLongitudeLocked = 'centerLongitudeLocked',
  Zoom = 'zoom',
  ZoomLocked = 'zoomLocked',
  UseExistingMap = 'useExistingMap',
  ExistingMapId = 'existingMapId'
}

/** Names of lockable fields that can sync with the map */
export enum LockableFieldName {
  Title = 'title',
  CenterLatitude = 'centerLatitude',
  CenterLongitude = 'centerLongitude',
  Zoom = 'zoom'
}
