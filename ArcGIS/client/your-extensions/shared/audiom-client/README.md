# Audiom Embed API Client

A strongly-typed TypeScript client library for embedding Audiom inclusive mapping solutions.

## Overview

This library provides a complete set of TypeScript interfaces, classes, and utilities for working with the Audiom Embed API. It offers type safety, autocompletion support, and a clean API for generating embed URLs and handling bidirectional PostMessage communication.

## Features

- ✅ **Strictly-typed interfaces** for all API parameters
- ✅ **Builder pattern** for easy configuration
- ✅ **Type-safe enums** for constants
- ✅ **URL generation** from configuration objects
- ✅ **Bidirectional PostMessage API** for iframe communication
- ✅ **Multi-source support** with namespaced parameters
- ✅ **Multi-source query serialization** — Esri SQL, OGC CQL2-Text, Overpass QL
- ✅ **Typed expression builder** with fluent API and SQL parsing
- ✅ **Spatial & temporal filters** — vendor-neutral and source-specific
- ✅ **Step size utilities** with multiple unit support
- ✅ **Feature filters** with global and scan modes

## Installation

```typescript
import {
  AudiomEmbedConfig,
  AudiomSource,
  StepSize,
  MapType,
  FilterMode,
  VisualStyle,
  AudiomMessageHandler,
  AudiomOutboundEventType,
  AudiomInboundCommandType,
  // Expression builder
  field, and, or, not, raw, toEsriSql, toCql2Text, toOverpassFilters, parse,
  // Multi-source serializers
  toEsriParams, toOgcParams, toOverpassQuery,
  // Spatial
  SpatialFilter, GeometryType, DistanceUnit,
  bbox, toOgcBboxParam, toOverpassBboxFilter,
  OverpassAroundFilter,
  // Temporal
  TimeInstant, TimeExtent,
  DateTimeInstant, DateTimeInterval,
  // Query options
  orderBy, SortOrder
} from './audiom-client';
```

## Quick Start

### Simple Dynamic Embed

```typescript
const config = AudiomEmbedConfig.dynamic({
  apiKey: 'your-api-key-here',
  sources: ['osm'],
  center: Coordinates.create(-122.1431, 47.6495),
  zoom: 15
});

const url = config.toUrl();
// https://audiom-staging.herokuapp.com/embed/dynamic?apiKey=...&sources=osm&center=-122.1431,47.6495&zoom=15
```

### Static Map with Numeric ID

```typescript
const config = AudiomEmbedConfig.static(12345, 'your-api-key-here', {
  zoom: 16,
  showVisualMap: false
});

const url = config.toUrl();
```

### Using StepSize

```typescript
const config = AudiomEmbedConfig.dynamic({
  apiKey: 'your-api-key-here',
  sources: ['osm'],
  center: Coordinates.create(-122.1431, 47.6495),
  stepSize: StepSize.meters(10) // Type-safe step size
});

// Alternative units:
StepSize.kilometers(5);
StepSize.miles(2);
StepSize.feet(100);
StepSize.parse('50m'); // Parse from string
```

## Working with Sources

### Simple Named Sources

```typescript
const config = AudiomEmbedConfig.dynamic({
  apiKey: 'your-api-key',
  sources: ['osm', 'TDEI'] // Simple string array
});
```

### ESRI Feature Services

```typescript
const source = AudiomSource.fromEsri({
  source: 'buildings',
  url: 'https://services.arcgis.com/.../FeatureServer/0',
  name: 'Building Details',
  mapType: MapType.Indoor,
  rules: '/rules/esri-indoor.json'
});

const config = AudiomEmbedConfig.dynamic({
  apiKey: 'your-api-key',
  sources: [source]
});
```

### GeoJSON URLs

```typescript
const source = AudiomSource.fromGeoJsonUrl(
  'https://example.com/data.geojson',
  'Custom Data'
);
```

### OGC API Features (TDEI)

```typescript
const source = AudiomSource.fromOgc({
  source: 'sidewalks',
  url: 'https://tdei.example.com/collections/sidewalks',
  where: field('surface').eq('concrete'),
  bbox: bbox(-122.35, 47.60, -122.30, 47.65),
  datetime: DateTimeInterval.create(
    new Date(Date.UTC(2024, 0, 1)),
    null // open-ended (to present)
  ),
  orderByFields: [orderBy('name', SortOrder.Ascending)],
  pagination: { count: 100 }
});
```

### Overpass / OSM

```typescript
const source = AudiomSource.fromOverpass({
  source: 'cafes',
  where: field('amenity').eq('cafe'),
  bbox: bbox(-122.42, 37.76, -122.38, 37.80),
  aroundFilter: OverpassAroundFilter.aroundPoint(500, 37.78, -122.40),
  overpassOptions: {
    format: 'json',
    timeout: 30,
    elementType: OverpassElementType.Nwr
  }
});
```

### Mixed Source Types

```typescript
const config = AudiomEmbedConfig.dynamic({
  apiKey: 'your-api-key',
  sources: [
    AudiomSource.fromName('osm'),
    AudiomSource.fromEsri({
      source: 'indoor',
      url: 'https://...',
      mapType: MapType.Indoor
    }),
    AudiomSource.fromOgc({
      source: 'sidewalks',
      url: 'https://tdei.example.com/collections/sidewalks'
    }),
    AudiomSource.fromGeoJsonUrl('https://example.com/data.geojson')
  ]
});
```

## Filters

```typescript
// Filter features by type in the URL
const config = AudiomEmbedConfig.dynamic({
  apiKey: 'your-api-key',
  sources: ['osm'],
  filters: ['walls', 'poi', 'building'],
  filterMode: FilterMode.Global // or FilterMode.Scan (default)
});
// Produces: &filters=walls,poi,building&filterMode=global
```

## Expression Filters (WHERE Clauses)

For sources that support query filtering (e.g., Esri feature services), you can build typed WHERE clause expressions using the fluent builder API, or parse raw SQL strings.

### Building Expressions

```typescript
import { field, and, or, not, raw, toEsriSql, parse } from 'audiom-embedder';

// Simple comparison
const expr = field('status').eq('active');
// → status = 'active'

// Numeric comparisons
field('height').gt(100);       // height > 100
field('floors').gte(10);       // floors >= 10
field('population').lt(5000);  // population < 5000
field('score').lte(99);        // score <= 99
field('type').neq('deleted');  // type <> 'deleted'
```

### Compound Expressions

```typescript
// AND / OR
const expr = and(
  field('type').eq('building'),
  or(
    field('height').gt(100),
    field('floors').gte(10)
  )
);
toEsriSql(expr);
// → type = 'building' AND (height > 100 OR floors >= 10)

// NOT
toEsriSql(not(field('status').eq('demolished')));
// → NOT (status = 'demolished')
```

### Pattern Matching, Sets, and Ranges

```typescript
// LIKE / NOT LIKE
field('name').like('Main%');        // name LIKE 'Main%'
field('name').notLike('%test%');     // name NOT LIKE '%test%'

// IN / NOT IN
field('category').in(['residential', 'commercial']);
// → category IN ('residential', 'commercial')

field('id').notIn([1, 2, 3]);
// → id NOT IN (1, 2, 3)

// BETWEEN / NOT BETWEEN
field('population').between(1000, 50000);
// → population BETWEEN 1000 AND 50000

// IS NULL / IS NOT NULL
field('notes').isNull();       // notes IS NULL
field('notes').isNotNull();    // notes IS NOT NULL
```

### Date Expressions

```typescript
// Date values serialize as TIMESTAMP literals
const cutoff = new Date(Date.UTC(2024, 0, 15, 10, 30, 0));
toEsriSql(field('created').gt(cutoff));
// → created > TIMESTAMP '2024-01-15 10:30:00'
```

### Raw SQL Escape Hatch

For vendor-specific syntax not covered by the typed builder:

```typescript
// ⚠️ Never pass untrusted user input to raw()
const expr = raw("position(current_user in workersfield) > 0");
toEsriSql(expr);
// → position(current_user in workersfield) > 0
```

### Parsing SQL Strings

Parse existing SQL WHERE clauses into the typed AST:

```typescript
const expr = parse("type = 'building' AND status = 'active'");
// → LogicalExpr { op: 'AND', children: [ComparisonExpr, ComparisonExpr] }

// Round-trip: parse then serialize
toEsriSql(parse("name LIKE 'Main%'"));
// → name LIKE 'Main%'

// Unparseable syntax falls back to RawExpr instead of throwing
parse("SOME_FUNC(a, b)");
// → RawExpr { sql: 'SOME_FUNC(a, b)' }
```

### Applying Expressions to Sources

```typescript
const source = AudiomSource.fromEsri({
  source: 'buildings',
  url: 'https://services.arcgis.com/.../FeatureServer/0',
  where: and(
    field('status').eq('active'),
    field('floors').gte(3)
  )
});
// Serializes to: buildings.where=status%20%3D%20'active'%20AND%20floors%20%3E%3D%203
```

### Spatial Filters

#### Esri Spatial Filters

Constrain Esri queries to features with a specific spatial relationship to an input geometry:

```typescript
import { SpatialFilter, GeometryType, DistanceUnit } from 'audiom-embedder';

// Bounding box intersection
const envelope = SpatialFilter.fromEnvelope(-123, 37, -122, 38, 4326);

// Point with distance buffer
const nearby = SpatialFilter.withinDistance(
  { x: -122.4, y: 37.8 },
  GeometryType.Point,
  1000,
  DistanceUnit.Meter
);

// Apply to an Esri source
const source = AudiomSource.fromEsri({
  source: 'poi',
  url: 'https://services.arcgis.com/.../FeatureServer/0',
  spatialFilter: nearby
});
```

#### Vendor-Neutral Bounding Box

Use `bbox()` for OGC and Overpass sources. Converts automatically to the target format:

```typescript
import { bbox, toOgcBboxParam, toOverpassBboxFilter, toEsriEnvelope } from 'audiom-embedder';

const box = bbox(-122.42, 37.76, -122.38, 37.80);

toOgcBboxParam(box);          // "-122.42,37.76,-122.38,37.8"
toOverpassBboxFilter(box);    // "(37.76,-122.42,37.8,-122.38)"
toEsriEnvelope(box, 4326);   // { xmin, ymin, xmax, ymax, spatialReference: { wkid: 4326 } }

// Apply to an OGC source
AudiomSource.fromOgc({ source: 'sidewalks', url: '...', bbox: box });

// Apply to an Overpass source
AudiomSource.fromOverpass({ source: 'cafes', bbox: box });
```

#### Overpass Proximity Filter

```typescript
import { OverpassAroundFilter } from 'audiom-embedder';

// Find features within 500m of a point
const around = OverpassAroundFilter.aroundPoint(500, 37.78, -122.40);

// Chain with a previous result set
const aroundSet = OverpassAroundFilter.aroundSet(200);

AudiomSource.fromOverpass({ source: 'cafes', aroundFilter: around });
```

### Temporal Filters

#### Esri Temporal Filters (Epoch-Based)

Filter time-aware Esri layers by instant or range:

```typescript
import { TimeInstant, TimeExtent } from 'audiom-embedder';

// Single point in time
const instant = TimeInstant.fromDate(new Date(Date.UTC(2024, 6, 1)));

// Time range
const range = TimeExtent.fromDates(
  new Date(Date.UTC(2024, 0, 1)),
  new Date(Date.UTC(2024, 11, 31))
);

// Open-ended range (from a date to present)
const since = TimeExtent.fromDates(new Date(Date.UTC(2024, 0, 1)), null);

// Apply to an Esri source
AudiomSource.fromEsri({
  source: 'events',
  url: 'https://services.arcgis.com/.../FeatureServer/0',
  time: range
});
```

#### Vendor-Neutral DateTime Filters (RFC 3339)

Use `DateTimeInstant` and `DateTimeInterval` for OGC and Overpass sources:

```typescript
import { DateTimeInstant, DateTimeInterval } from 'audiom-embedder';

// Single instant → RFC 3339
const instant = DateTimeInstant.fromDate(new Date(Date.UTC(2024, 6, 1)));
instant.toRfc3339(); // "2024-07-01T00:00:00Z"

// Date range for OGC datetime parameter
const interval = DateTimeInterval.create(
  new Date(Date.UTC(2024, 0, 1)),
  new Date(Date.UTC(2024, 11, 31))
);
interval.toOgcDateTimeParam(); // "2024-01-01T00:00:00Z/2024-12-31T00:00:00Z"

// Apply to an OGC source
AudiomSource.fromOgc({ source: 'sidewalks', url: '...', datetime: interval });

// Apply to an Overpass source (instant only)
AudiomSource.fromOverpass({ source: 'cafes', datetime: instant });
```

### Query Options

Sort and paginate results on any source type:

```typescript
import { orderBy, SortOrder } from 'audiom-embedder';

AudiomSource.fromEsri({
  source: 'buildings',
  url: 'https://services.arcgis.com/.../FeatureServer/0',
  outFields: ['name', 'height', 'floors'],
  orderByFields: [orderBy('height', SortOrder.Descending)],
  pagination: { count: 50, offset: 0 }
});
```

## Multi-Source Query Serialization

Expression ASTs are serialized differently depending on the target source. The library provides three serializers and three source-type strategy functions:

### Expression Serializers

```typescript
import { field, and, toEsriSql, toCql2Text, toOverpassFilters } from 'audiom-embedder';

const expr = and(
  field('type').eq('building'),
  field('status').eq('active')
);

toEsriSql(expr);
// → "type = 'building' AND status = 'active'"

toCql2Text(expr);
// → "type = 'building' AND status = 'active'"

toOverpassFilters(expr);
// → '["type"="building"]["status"="active"]'
```

### Source-Type Strategy Functions

Use these to produce complete query parameter objects for each source type:

```typescript
import { toEsriParams, toOgcParams, toOverpassQuery } from 'audiom-embedder';

// Esri REST API parameters
toEsriParams({
  where: field('type').eq('building'),
  spatialFilter: SpatialFilter.fromEnvelope(-123, 37, -122, 38),
  outFields: ['name', 'height'],
  orderByFields: [orderBy('height', SortOrder.Descending)],
  pagination: { count: 100 }
});
// → { where: "type = 'building'", geometryType: "...", geometry: "...", outFields: "name,height", ... }

// OGC API Features parameters
toOgcParams({
  where: field('surface').eq('concrete'),
  bbox: bbox(-122.35, 47.60, -122.30, 47.65),
  datetime: DateTimeInterval.create(new Date(2024, 0, 1), null)
});
// → { filter: "surface = 'concrete'", "filter-lang": "cql2-text", bbox: "...", datetime: "..." }

// Overpass QL query body
toOverpassQuery({
  where: field('amenity').eq('cafe'),
  bbox: bbox(-122.42, 37.76, -122.38, 37.80)
});
// → '[out:json][timeout:25];nwr["amenity"="cafe"](37.76,-122.42,37.8,-122.38);out body geom;'
```

## PostMessage API

The PostMessage API enables bidirectional communication between your app and an embedded Audiom map. It must be enabled by specifying `allowedOrigins`.

### Enabling the API

```typescript
const config = AudiomEmbedConfig.dynamic({
  apiKey: 'your-api-key',
  sources: ['osm'],
  latitude: 47.6495,
  longitude: -122.1431,
  allowedOrigins: ['https://myapp.com', 'https://staging.myapp.com']
  // or allowedOrigins: '*' for development
});
```

### Listening for Events

```typescript
const handler = new AudiomMessageHandler('https://your-audiom-instance.com');

// Embed is ready
handler.on(AudiomOutboundEventType.Ready, (payload) => {
  console.log('Audiom ready, API version:', payload.apiVersion);
});

// Avatar moved
handler.on(AudiomOutboundEventType.PositionChanged, (payload) => {
  const [lng, lat] = payload.position;
  console.log('User moved to:', lng, lat);
});

// Avatar entered features
handler.on(AudiomOutboundEventType.FeatureEntered, (payload) => {
  payload.features.forEach(f => {
    console.log(`Entered ${f.type}: ${f.name}`);
  });
});

// Avatar exited features  
handler.on(AudiomOutboundEventType.FeatureExited, (payload) => {
  payload.features.forEach(f => console.log('Exited:', f.id));
});

// State query response
handler.on(AudiomOutboundEventType.StateChanged, (payload) => {
  console.log('Current position:', payload.position);
});

// Errors
handler.on(AudiomOutboundEventType.Error, (payload) => {
  console.error(`Audiom error [${payload.code}]:`, payload.message);
});

// Remove a specific listener
handler.off(AudiomOutboundEventType.PositionChanged, myListener);

// Clean up
handler.dispose();
```

### Sending Commands

```typescript
const iframe = document.getElementById('audiom-embed') as HTMLIFrameElement;
const audiomOrigin = 'https://your-audiom-instance.com';

// Move the avatar
handler.moveAvatar(iframe, [-122.4194, 37.7749], audiomOrigin);
// Or with Coordinates:
handler.moveAvatar(iframe, Coordinates.create(-122.4194, 37.7749), audiomOrigin);

// Query current position (responds with stateChanged event)
handler.getState(iframe, audiomOrigin);

// Query enclosing features (responds with featureSelected event)
handler.getEnclosingFeatures(iframe, audiomOrigin);

// Set filters
handler.setFilters(iframe, {
  global: ['building', 'park'],
  scan: ['poi', 'transit']
}, audiomOrigin);

// Execute a keyboard command
handler.executeCommand(iframe, 'announcePosition', audiomOrigin);
// Common commands: 'up', 'down', 'left', 'right', 'toggleSonar', 'announcePosition'
```

## Complex Multi-Source Example

```typescript
const config = AudiomEmbedConfig.dynamic({
  apiKey: 'wO35blaGsjJREGuXehqWU',
  sources: [
    AudiomSource.fromEsri({
      source: 'details',
      url: 'https://services7.arcgis.com/.../FeatureServer/0',
      name: 'Details',
      mapType: MapType.Indoor,
      rules: '/rules/esri-indoor.json'
    }),
    AudiomSource.fromEsri({
      source: 'units',
      url: 'https://services7.arcgis.com/.../FeatureServer/1',
      name: 'Units',
      mapType: MapType.Indoor,
      rules: '/rules/esri-indoor.json'
    }),
    AudiomSource.fromEsri({
      source: 'levels',
      url: 'https://services7.arcgis.com/.../FeatureServer/2',
      name: 'Levels',
      mapType: MapType.Indoor,
      rules: '/rules/esri-indoor.json'
    })
  ],
  center: Coordinates.create(-117.1945001420124, 34.05679755835778)
});

const url = config.toUrl();
```

## Full Configuration Example

```typescript
const config = AudiomEmbedConfig.dynamic({
  apiKey: 'your-api-key-here',
  sources: [
    AudiomSource.fromEsri({
      source: 'buildings',
      url: 'https://example.com/featureserver/0',
      name: 'Building Data',
      mapType: MapType.Indoor
    })
  ],
  center: Coordinates.create(-117.19, 34.06),
  zoom: 18,
  title: 'Campus Indoor Navigation',
  soundpack: '/audio/campus',
  demo: false,
  showVisualMap: true,
  heading: 1,
  showHeading: true,
  stepSize: StepSize.meters(5),
  filters: ['walls', 'poi'],
  filterMode: FilterMode.Scan,
  visualStyle: VisualStyle.Indoor,
  allowedOrigins: ['https://myapp.com'],
  additionalParams: {
    organizationId: '12345',
    customFlag: true
  }
});

const url = config.toUrl();
```

## Using Custom Base URLs

```typescript
// Development
const devUrl = config.toUrl('https://audiom-dev.herokuapp.com');

// Production
const prodUrl = config.toUrlWithBase('https://audiom.example.com');
```

## API Reference

### Classes

- **`AudiomEmbedConfig`** - Main configuration class for embed maps
- **`AudiomSource`** - Data source configuration (factories: `fromEsri`, `fromOgc`, `fromOverpass`, `fromName`, `fromGeoJsonUrl`)
- **`StepSize`** - Step size with unit support
- **`Coordinates`** - Geographic coordinate (longitude, latitude)
- **`GeoQuad`** - Geographic quadrilateral (4 corners)
- **`AudiomMessageHandler`** - Bidirectional PostMessage communication handler
- **`SpatialFilter`** - Esri spatial query filter (`intersects`, `contains`, `within`, `withinDistance`, `fromEnvelope`)
- **`OverpassAroundFilter`** - Overpass proximity filter (`aroundPoint`, `aroundSet`)
- **`TimeInstant`** / **`TimeExtent`** - Esri temporal filters (epoch-based)
- **`DateTimeInstant`** / **`DateTimeInterval`** - Vendor-neutral temporal filters (Date-based, RFC 3339)

### Serializers

- **`toEsriSql(expr)`** - Expression → Esri SQL-92 WHERE clause
- **`toCql2Text(expr)`** - Expression → OGC CQL2-Text
- **`toOverpassFilters(expr)`** - Expression → Overpass QL tag filters
- **`toEsriParams(options)`** - Full Esri REST query parameters
- **`toOgcParams(options)`** - Full OGC API Features parameters
- **`toOverpassQuery(options)`** - Complete Overpass QL query body

### Enums

- **`MapType`** - `Travel`, `Heatmap`, `Indoor`
- **`SourceType`** - `OSM`, `TDEI`, `ESRI`, `GeoJSON`
- **`StepSizeUnit`** - `Kilometers`, `Meters`, `Miles`, `Feet`
- **`VisualStyle`** - `Geology`, `Indoor`, `Outdoor`, `Travel`
- **`FilterMode`** - `Global`, `Scan`
- **`SpatialRelationship`** - `Intersects`, `Contains`, `Crosses`, `Within`, etc.
- **`GeometryType`** - `Point`, `Multipoint`, `Polyline`, `Polygon`, `Envelope`
- **`DistanceUnit`** - `Meter`, `Foot`, `Kilometer`, `StatuteMile`, `NauticalMile`
- **`SortOrder`** - `Ascending`, `Descending`
- **`OverpassElementType`** - `Node`, `Way`, `Relation`, `Nwr`
- **`IntervalUnit`** / **`CompoundIntervalUnit`** - SQL INTERVAL units for relative date queries
- **`AudiomOutboundEventType`** - `Ready`, `PositionChanged`, `FeatureEntered`, `FeatureExited`, `FeatureSelected`, `StateChanged`, `Error`
- **`AudiomInboundCommandType`** - `MoveAvatar`, `GetState`, `GetEnclosingFeatures`, `SetFilters`, `ExecuteCommand`
- **`AudiomErrorCode`** - `INVALID_ORIGIN`, `INVALID_MESSAGE`, `UNKNOWN_COMMAND`, `COMMAND_FAILED`, `NOT_READY`

### Interfaces

- **`IAudiomEmbedConfig`** - Configuration interface
- **`IAudiomSource`** - Source interface (includes `where`, `spatialFilter`, `time`, `bbox`, `datetime`, `aroundFilter`, `outFields`, `orderByFields`, `pagination`)
- **`BoundingBox`** - Vendor-neutral bounding box (`{ west, south, east, north }`)
- **`Expression`** - Discriminated union of filter expression AST nodes
- **`EsriParamOptions`** / **`OgcParamOptions`** / **`OverpassQueryOptions`** - Source-type serializer options
- **`OrderByField`** / **`PaginationOptions`** - Query sort and pagination
- **`IVisualBaseLayer`** - Visual base layer configuration
- **`IFeaturePayload`** - Map feature payload in PostMessage events
- **`ISetFiltersPayload`** - Filter configuration for PostMessage commands
- **`AudiomEventPayloadMap`** - Type map for event payloads

### Types

- **`AudiomOutboundMessage`** - Discriminated union of all outbound event messages
- **`AudiomInboundCommand`** - Discriminated union of all inbound command messages
- **`AudiomEventListener<T>`** - Typed listener callback for a specific event type

## Type Safety

All parameters are strongly typed with TypeScript:

```typescript
const config: AudiomEmbedConfig = AudiomEmbedConfig.dynamic({
  apiKey: 'key',
  heading: 1, // ✅ Valid (1-6)
  // heading: 7, // ❌ TypeScript error
  
  center: Coordinates.create(-122.14, 47.65), // ✅ Coordinates object
  
  visualStyle: VisualStyle.Indoor, // ✅ Type-safe enum
  // visualStyle: 'invalid', // ❌ TypeScript error
  
  filterMode: FilterMode.Global, // ✅ Type-safe enum
});

// Typed event listeners
handler.on(AudiomOutboundEventType.PositionChanged, (payload) => {
  // payload is typed as IPositionChangedPayload
  const [lng, lat] = payload.position; // ✅ [number, number]
});

handler.on(AudiomOutboundEventType.FeatureEntered, (payload) => {
  // payload is typed as IFeatureEnteredPayload
  payload.features[0].name; // ✅ string
  payload.features[0].properties; // ✅ Record<string, unknown>
});
```

## Error Handling

```typescript
try {
  // Invalid step size
  const stepSize = StepSize.parse('invalid');
} catch (error) {
  console.error('Invalid step size format:', error.message);
}

try {
  // Negative step size
  const stepSize = StepSize.meters(-5);
} catch (error) {
  console.error('Step size must be positive:', error.message);
}
```

## License

See project license.
