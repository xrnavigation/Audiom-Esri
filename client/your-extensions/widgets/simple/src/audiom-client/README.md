# Audiom Embed API Client

A strongly-typed TypeScript client library for embedding Audiom inclusive mapping solutions.

## Overview

This library provides a complete set of TypeScript interfaces, classes, and utilities for working with the Audiom Embed API. It offers type safety, autocompletion support, and a clean API for generating embed URLs and handling PostMessage communication.

## Features

- ✅ **Strictly-typed interfaces** for all API parameters
- ✅ **Builder pattern** for easy configuration
- ✅ **Type-safe enums** for constants
- ✅ **URL generation** from configuration objects
- ✅ **PostMessage handler** for iframe communication
- ✅ **Multi-source support** with namespaced parameters
- ✅ **Step size utilities** with multiple unit support

## Installation

```typescript
import {
  AudiomEmbedConfig,
  AudiomSource,
  StepSize,
  MapType,
  AudiomMessageHandler
} from './audiom-client';
```

## Quick Start

### Simple Dynamic Embed

```typescript
const config = AudiomEmbedConfig.dynamic({
  apiKey: 'your-api-key-here',
  sources: ['osm'],
  center: [-122.1431, 47.6495],
  zoom: 15
});

const url = config.toUrl();
// https://audiom-staging.herokuapp.com/embed/dynamic?apiKey=...&source=osm&center=-122.1431,47.6495&zoom=15
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
  center: [-122.1431, 47.6495],
  stepsize: StepSize.Meters(10) // Type-safe step size
});

// Alternative units:
StepSize.Kilometers(5);
StepSize.Miles(2);
StepSize.Feet(100);
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
    AudiomSource.fromGeoJsonUrl('https://example.com/data.geojson')
  ]
});
```

## Complex Multi-Source Example

This example matches the indoor mapping URL from the documentation:

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
  center: [-117.1945001420124, 34.05679755835778]
});

const url = config.toUrl();
```

## Listening to User Position Updates

```typescript
// Create message handler
const messageHandler = new AudiomMessageHandler(
  'https://audiom-staging.herokuapp.com' // Optional: restrict to origin
);

// Add listener
messageHandler.addUserPositionListener((position) => {
  const [longitude, latitude] = position;
  console.log('User moved to:', longitude, latitude);
  // Update your UI, sync with other maps, etc.
});

// Clean up when done
messageHandler.removeAllListeners();
messageHandler.dispose();
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
  center: [-117.19, 34.06],
  zoom: 18,
  title: 'Campus Indoor Navigation',
  soundpack: '/audio/campus',
  demo: false,
  showVisualMap: true,
  heading: 1,
  showHeading: true,
  stepsize: StepSize.Meters(5),
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
- **`AudiomSource`** - Data source configuration
- **`StepSize`** - Step size with unit support
- **`AudiomMessageHandler`** - PostMessage communication handler

### Enums

- **`MapType`** - `Travel`, `Heatmap`, `Indoor`
- **`SourceType`** - `OSM`, `TDEI`, `ESRI`, `GeoJSON`
- **`StepSizeUnit`** - `Kilometers`, `Meters`, `Miles`, `Feet`

### Types

- **`Coordinates`** - `[longitude, latitude]` tuple
- **`IAudiomEmbedConfig`** - Configuration interface
- **`IAudiomSource`** - Source interface
- **`AudiomUserPositionListener`** - Position update callback

## Type Safety

All parameters are strongly typed with TypeScript:

```typescript
const config: AudiomEmbedConfig = AudiomEmbedConfig.dynamic({
  apiKey: 'key',
  heading: 1, // ✅ Valid (1-6)
  // heading: 7, // ❌ TypeScript error
  
  center: [-122.14, 47.65], // ✅ [longitude, latitude]
  // center: [47.65, -122.14], // ⚠️ No compile error, but logically incorrect
  
  mapType: MapType.Indoor, // ✅ Type-safe enum
  // mapType: 'invalid', // ❌ TypeScript error
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
  const stepSize = StepSize.Meters(-5);
} catch (error) {
  console.error('Step size must be positive:', error.message);
}
```

## License

See project license.
