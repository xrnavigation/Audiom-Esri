import { describe, it, expect } from 'vitest';
import { AudiomEmbedConfig } from './AudiomEmbedConfig';
import { StepSize } from './StepSize';
import { SourceType } from './AudiomSource';
import { Coordinates } from './Coordinates';

describe('AudiomEmbedConfig', () => {
  describe('dynamic', () => {
    it('should create a dynamic embed configuration', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        sources: ['osm'],
        center: Coordinates.create(-122.1431, 47.6495),
        zoom: 15
      });

      expect(config).toBeDefined();
      expect(config.embedId).toBe('dynamic');
      const url = config.toUrl();
      expect(url).toContain('embed/dynamic');
      expect(url).toContain('apiKey=test-key');
      expect(url).toContain('sources=osm');
    });

    it('should handle multiple sources', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        sources: ['osm', 'google']
      });

      const url = config.toUrl();
      expect(url).toContain('sources=osm%2Cgoogle');
    });

    it('should include step size when provided', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        sources: ['osm'],
        stepSize: StepSize.meters(50)
      });

      const url = config.toUrl();
      expect(url).toContain('stepsize=50m');
    });

    it('should parse step size from string', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        sources: ['osm'],
        stepSize: '100ft'
      });

      expect(config.stepSize).toBeDefined();
      expect(config.stepSize!.value).toBe(100);
      expect(config.stepSize!.toString()).toBe('100ft');
    });

    it('should handle source objects', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        sources: [{ source: 'mySource', type: SourceType.ESRI, url: 'https://example.com/layer' }]
      });

      expect(config.sources).toHaveLength(1);
      expect(config.sources![0].source).toBe('mySource');
      expect(config.sources![0].type).toBe(SourceType.ESRI);
    });
  });

  describe('static', () => {
    it('should create a static embed configuration with numeric ID', () => {
      const key = 12345;
      const keyName = 'test-key';
      const config = AudiomEmbedConfig.static(key, keyName);

      const url = config.toUrl();
      expect(url).toContain(`embed/${key}`);
      expect(url).toContain(`apiKey=${keyName}`);
    });

    it('should create a static embed configuration with string ID', () => {
      const config = AudiomEmbedConfig.static(1, 'test-key');

      const url = config.toUrl();
      expect(url).toContain('embed/1');
      expect(url).toContain('apiKey=test-key');
    });

    it('should accept optional parameters', () => {
      const config = AudiomEmbedConfig.static(12345, 'test-key', {
        zoom: 10,
      });

      const url = config.toUrl();
      expect(url).toContain('zoom=10');
    });
  });
});
