// Barrel exports for spatial abstractions

export type { BoundingBox } from './BoundingBox';
export { bbox, toOgcBboxParam, toOverpassBboxFilter, toEsriEnvelope } from './BoundingBox';

export {
  SpatialRelationship,
  GeometryType,
  DistanceUnit,
  SpatialFilter,
} from './EsriSpatialFilter';
export type { ISpatialFilter, EsriEnvelope, EsriPoint, GeometryInput } from './EsriSpatialFilter';

export { OverpassAroundFilter } from './OverpassSpatialFilter';
