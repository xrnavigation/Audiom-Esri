/**
 * Typed spatial filter configuration for Esri feature service queries.
 *
 * @see https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/
 * @see https://developers.arcgis.com/rest/services-reference/enterprise/geometry-objects/
 */

export enum SpatialRelationship {
  Intersects = 'esriSpatialRelIntersects',
  Contains = 'esriSpatialRelContains',
  Crosses = 'esriSpatialRelCrosses',
  EnvelopeIntersects = 'esriSpatialRelEnvelopeIntersects',
  IndexIntersects = 'esriSpatialRelIndexIntersects',
  Overlaps = 'esriSpatialRelOverlaps',
  Touches = 'esriSpatialRelTouches',
  Within = 'esriSpatialRelWithin'
}

export enum GeometryType {
  Point = 'esriGeometryPoint',
  Multipoint = 'esriGeometryMultipoint',
  Polyline = 'esriGeometryPolyline',
  Polygon = 'esriGeometryPolygon',
  Envelope = 'esriGeometryEnvelope'
}

export enum DistanceUnit {
  Meter = 'esriSRUnit_Meter',
  Foot = 'esriSRUnit_Foot',
  Kilometer = 'esriSRUnit_Kilometer',
  StatuteMile = 'esriSRUnit_StatuteMile',
  NauticalMile = 'esriSRUnit_NauticalMile'
}

export interface EsriEnvelope {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  spatialReference?: { wkid: number };
}

export interface EsriPoint {
  x: number;
  y: number;
  spatialReference?: { wkid: number };
}

/**
 * Any Esri geometry JSON object, or a simple comma-delimited string.
 */
export type GeometryInput = EsriEnvelope | EsriPoint | Record<string, unknown> | string;

export interface ISpatialFilter {
  geometry: GeometryInput;
  geometryType: GeometryType;
  spatialRel: SpatialRelationship;
  inSR?: number | { wkid: number };
  distance?: number;
  units?: DistanceUnit;
}

export class SpatialFilter implements ISpatialFilter {
  geometry: GeometryInput;
  geometryType: GeometryType;
  spatialRel: SpatialRelationship;
  inSR?: number | { wkid: number };
  distance?: number;
  units?: DistanceUnit;

  constructor(config: ISpatialFilter) {
    this.geometry = config.geometry;
    this.geometryType = config.geometryType;
    this.spatialRel = config.spatialRel;
    this.inSR = config.inSR;
    this.distance = config.distance;
    this.units = config.units;
  }

  static intersects(geometry: GeometryInput, geometryType: GeometryType): SpatialFilter {
    return new SpatialFilter({ geometry, geometryType, spatialRel: SpatialRelationship.Intersects });
  }

  static contains(geometry: GeometryInput, geometryType: GeometryType): SpatialFilter {
    return new SpatialFilter({ geometry, geometryType, spatialRel: SpatialRelationship.Contains });
  }

  static within(geometry: GeometryInput, geometryType: GeometryType): SpatialFilter {
    return new SpatialFilter({ geometry, geometryType, spatialRel: SpatialRelationship.Within });
  }

  static withinDistance(
    geometry: GeometryInput,
    geometryType: GeometryType,
    distance: number,
    units: DistanceUnit = DistanceUnit.Meter
  ): SpatialFilter {
    return new SpatialFilter({
      geometry,
      geometryType,
      spatialRel: SpatialRelationship.Intersects,
      distance,
      units
    });
  }

  static fromEnvelope(xmin: number, ymin: number, xmax: number, ymax: number, wkid?: number): SpatialFilter {
    const envelope: EsriEnvelope = { xmin, ymin, xmax, ymax };
    if (wkid) {
      envelope.spatialReference = { wkid };
    }
    return SpatialFilter.intersects(envelope, GeometryType.Envelope);
  }

  toQueryParams(): Record<string, string> {
    const params: Record<string, string> = {};

    params['geometryType'] = this.geometryType;
    params['spatialRel'] = this.spatialRel;

    if (typeof this.geometry === 'string') {
      params['geometry'] = this.geometry;
    } else {
      params['geometry'] = JSON.stringify(this.geometry);
    }

    if (this.inSR !== undefined) {
      params['inSR'] = typeof this.inSR === 'number'
        ? String(this.inSR)
        : JSON.stringify(this.inSR);
    }

    if (this.distance !== undefined) {
      params['distance'] = String(this.distance);
    }

    if (this.units) {
      params['units'] = this.units;
    }

    return params;
  }
}
