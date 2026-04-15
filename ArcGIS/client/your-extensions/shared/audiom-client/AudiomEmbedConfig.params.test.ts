import { describe, it, expect } from 'vitest';
import { AudiomEmbedConfig, FilterMode, VisualStyle } from './AudiomEmbedConfig';
import { StepSize } from './StepSize';
import { SourceType, MapType } from './AudiomSource';
import { Coordinates } from './Coordinates';
import { field } from './expressions/AttributeFilter';

describe('AudiomEmbedConfig query parameters', () => {
  describe('toQueryParams', () => {
    it('should always include apiKey', () => {
      const config = AudiomEmbedConfig.dynamic({ apiKey: 'my-api-key' });
      const params = config.toQueryParams();
      expect(params.apiKey).toBe('my-api-key');
    });

    it('should include title when set', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        title: 'My Map'
      });

      const params = config.toQueryParams();
      expect(params.title).toBe('My Map');
    });

    it('should include zoom when set', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        zoom: 15
      });

      const params = config.toQueryParams();
      expect(params.zoom).toBe('15');
    });

    it('should include soundpack when set', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        soundpack: 'nature'
      });

      const params = config.toQueryParams();
      expect(params.soundpack).toBe('nature');
    });

    it('should include demo flag when set', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        demo: true
      });

      const params = config.toQueryParams();
      expect(params.demo).toBe('true');
    });

    it('should include showVisualMap when set', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        showVisualMap: false
      });

      const params = config.toQueryParams();
      expect(params.showVisualMap).toBe('false');
    });

    it('should include heading when set', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        heading: 3
      });

      const params = config.toQueryParams();
      expect(params.heading).toBe('3');
    });

    it('should include showHeading when set', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        showHeading: true
      });

      const params = config.toQueryParams();
      expect(params.showHeading).toBe('true');
    });

    it('should include stepsize when set', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        stepSize: StepSize.meters(50)
      });

      const params = config.toQueryParams();
      expect(params.stepsize).toBe('50m');
    });

    it('should use latitude/longitude fallback when no center', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        latitude: 47.5,
        longitude: -122.5
      });

      const params = config.toQueryParams();
      expect(params.latitude).toBe('47.5');
      expect(params.longitude).toBe('-122.5');
      expect(params.center).toBeUndefined();
    });

    it('should prefer center over latitude/longitude', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        center: Coordinates.create(-122.5, 47.5),
        latitude: 99,
        longitude: 99
      });

      const params = config.toQueryParams();
      expect(params.center).toBeDefined();
      expect(params.latitude).toBeUndefined();
      expect(params.longitude).toBeUndefined();
    });
  });

  describe('filters', () => {
    it('should include filters as comma-separated string', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        filters: ['building', 'road', 'park']
      });

      const params = config.toQueryParams();
      expect(params.filters).toBe('building,road,park');
    });

    it('should not include filters when empty', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        filters: []
      });

      const params = config.toQueryParams();
      expect(params.filters).toBeUndefined();
    });
  });

  describe('filterMode', () => {
    it('should include filterMode when set to global', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        filterMode: FilterMode.Global
      });

      const params = config.toQueryParams();
      expect(params.filterMode).toBe('global');
    });

    it('should include filterMode when set to scan', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        filterMode: FilterMode.Scan
      });

      const params = config.toQueryParams();
      expect(params.filterMode).toBe('scan');
    });
  });

  describe('visualStyle', () => {
    it('should include visualStyle when set', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        visualStyle: VisualStyle.Geology
      });

      const params = config.toQueryParams();
      expect(params.visualStyle).toBe('geology');
    });

    it('should support all visual style values', () => {
      expect(VisualStyle.Geology).toBe('geology');
      expect(VisualStyle.Indoor).toBe('indoor');
      expect(VisualStyle.Outdoor).toBe('outdoor');
      expect(VisualStyle.Travel).toBe('travel');
    });
  });

  describe('visualBaseLayers', () => {
    it('should include visual base layer URL', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        visualBaseLayers: [{ url: 'https://example.com/overlay.png' }]
      });

      const params = config.toQueryParams();
      expect(params.visualbaselayer0).toBe('https://example.com/overlay.png');
    });

    it('should include multiple visual base layers', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        visualBaseLayers: [
          { url: 'https://example.com/layer0.png' },
          { url: 'https://example.com/layer1.png' }
        ]
      });

      const params = config.toQueryParams();
      expect(params.visualbaselayer0).toBe('https://example.com/layer0.png');
      expect(params.visualbaselayer1).toBe('https://example.com/layer1.png');
    });

    it('should not include visualBaseLayers when empty', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        visualBaseLayers: []
      });

      const params = config.toQueryParams();
      expect(params.visualbaselayer0).toBeUndefined();
    });
  });

  describe('allowedOrigins', () => {
    it('should include allowedOrigins as comma-separated string for array', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        allowedOrigins: ['https://app1.example.com', 'https://app2.example.com']
      });

      const params = config.toQueryParams();
      expect(params.allowedOrigins).toBe('https://app1.example.com,https://app2.example.com');
    });

    it('should include allowedOrigins as-is for wildcard string', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        allowedOrigins: '*'
      });

      const params = config.toQueryParams();
      expect(params.allowedOrigins).toBe('*');
    });

    it('should include allowedOrigins as-is for single string', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        allowedOrigins: 'https://myapp.example.com'
      });

      const params = config.toQueryParams();
      expect(params.allowedOrigins).toBe('https://myapp.example.com');
    });
  });

  describe('additionalParams', () => {
    it('should include additional custom parameters', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        additionalParams: {
          customFlag: true,
          customNum: 42,
          customStr: 'hello'
        }
      });

      const params = config.toQueryParams();
      expect(params.customFlag).toBe('true');
      expect(params.customNum).toBe('42');
      expect(params.customStr).toBe('hello');
    });
  });

  describe('source query params', () => {
    it('should include source-specific parameters', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        sources: [{
          source: 'myEsri',
          type: SourceType.ESRI,
          url: 'https://example.com/arcgis/layer',
          mapType: MapType.Travel,
          where: field('type').eq('building')
        }]
      });

      const params = config.toQueryParams();
      expect(params.sources).toBe('myEsri');
      expect(params['myEsri.type']).toBe(SourceType.ESRI);
      expect(params['myEsri.url']).toBe('https://example.com/arcgis/layer');
      expect(params['myEsri.mapType']).toBe(MapType.Travel);
      expect(params['myEsri.where']).toBe("type = 'building'");
    });
  });
});
