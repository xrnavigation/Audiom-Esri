// Barrel exports for the expressions module

export type {
  Expression,
  ComparisonExpr,
  LogicalExpr,
  NotExpr,
  LikeExpr,
  InExpr,
  BetweenExpr,
  IsNullExpr,
  RawExpr,
  LiteralValue
} from './Expression';
export { ComparisonOp, LogicalOp, ExpressionType } from './Expression';

export { FieldRef, field, and, or, not, raw } from './AttributeFilter';

export {
  SpatialRelationship,
  GeometryType,
  DistanceUnit,
  SpatialFilter
} from './spatial/EsriSpatialFilter';
export type { ISpatialFilter, EsriEnvelope, EsriPoint, GeometryInput } from './spatial/EsriSpatialFilter';

export type { BoundingBox } from './spatial';
export { bbox, toOgcBboxParam, toOverpassBboxFilter, toEsriEnvelope } from './spatial';
export { OverpassAroundFilter } from './spatial';

export {
  TimeInstant,
  TimeExtent,
  IntervalUnit,
  CompoundIntervalUnit,
  interval,
  intervalToString
} from './temporal/EsriTemporalFilter';
export type { IntervalExpression } from './temporal/EsriTemporalFilter';

export { DateTimeInstant, DateTimeInterval, toRfc3339 } from './temporal';

export { parse } from './parsing';

export { toEsriSql, toCql2Text, toOverpassFilters, UnsupportedOverpassExpressionError } from './serializers';

export {
  SortOrder,
  orderBy,
  orderByFieldsToString
} from './QueryOptions';
export type { OrderByField, PaginationOptions } from './QueryOptions';

export {
  toEsriParams,
  toOgcParams,
  toOverpassQuery,
  OverpassElementType,
} from './SourceTypeSerializer';
export type {
  EsriParamOptions,
  OgcParamOptions,
  OverpassQueryOptions,
  OverpassOutputOptions,
} from './SourceTypeSerializer';
