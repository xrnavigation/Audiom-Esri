import { describe, it, expect } from 'vitest';
import { AudiomEmbedConfig } from './AudiomEmbedConfig';
import { Coordinates } from './Coordinates';

describe('AudiomEmbedConfig URL generation', () => {
  describe('toUrl', () => {
    it('should generate a valid URL', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        sources: ['osm']
      });

      const url = config.toUrl();
      expect(url).toMatch(/^https?:\/\//);
    });

    it('should include center coordinates when provided', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        sources: ['osm'],
        center: Coordinates.create(-122.5, 47.5)
      });

      const url = config.toUrl();
      expect(url).toContain('center=-122.5%2C47.5');
    });

    it('should use default base URL', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        sources: ['osm']
      });

      const url = config.toUrl();
      expect(url.startsWith(AudiomEmbedConfig.defaultBaseURL)).toBe(true);
    });

    it('should accept custom base URL', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        sources: ['osm']
      });

      const url = config.toUrl('https://custom.example.com');
      expect(url.startsWith('https://custom.example.com')).toBe(true);
    });
  });

  describe('toUrlWithBase', () => {
    it('should generate URL with custom base', () => {
      const config = AudiomEmbedConfig.dynamic({
        apiKey: 'test-key',
        sources: ['osm']
      });

      const url = config.toUrlWithBase('https://prod.audiom.com');
      expect(url.startsWith('https://prod.audiom.com')).toBe(true);
      expect(url).toContain('embed/dynamic');
    });
  });
});
