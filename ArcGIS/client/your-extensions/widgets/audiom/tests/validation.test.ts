import { VisualBaseLayerType } from '../../../shared/audiom-client/AudiomEmbedConfig'
import {
  validateLatitude,
  validateLongitude,
  validateZoom,
  validateStepSize,
  validateUrl,
  validateImageLayerUrl,
  visualBaseLayerTypeFromUrl,
  validateRequired,
  VALIDATION
} from '../src/setting/validation/validation'

describe('validation', () => {
  describe('validateLatitude', () => {
    it.each([0, 45, -45, VALIDATION.LATITUDE_MIN, VALIDATION.LATITUDE_MAX])(
      'accepts in-range value %p', (v) => {
        expect(validateLatitude(v).valid).toBe(true)
      }
    )

    it.each([VALIDATION.LATITUDE_MIN - 0.0001, VALIDATION.LATITUDE_MAX + 0.0001, 91, -91, 1000])(
      'rejects out-of-range value %p', (v) => {
        const r = validateLatitude(v)
        expect(r.valid).toBe(false)
        expect(r.msg).toMatch(/Latitude/)
      }
    )

    it('treats nullish/undefined as valid', () => {
      expect(validateLatitude(undefined).valid).toBe(true)
    })
  })

  describe('validateLongitude', () => {
    it.each([0, 100, -100, VALIDATION.LONGITUDE_MIN, VALIDATION.LONGITUDE_MAX])(
      'accepts in-range value %p', (v) => {
        expect(validateLongitude(v).valid).toBe(true)
      }
    )

    it.each([VALIDATION.LONGITUDE_MIN - 1, VALIDATION.LONGITUDE_MAX + 1, 181, -181])(
      'rejects out-of-range value %p', (v) => {
        const r = validateLongitude(v)
        expect(r.valid).toBe(false)
        expect(r.msg).toMatch(/Longitude/)
      }
    )
  })

  describe('validateZoom', () => {
    it.each([0, 10, VALIDATION.ZOOM_MIN, VALIDATION.ZOOM_MAX])(
      'accepts in-range value %p', (v) => {
        expect(validateZoom(v).valid).toBe(true)
      }
    )

    it.each([-1, VALIDATION.ZOOM_MAX + 1, 100])(
      'rejects out-of-range value %p', (v) => {
        expect(validateZoom(v).valid).toBe(false)
      }
    )
  })

  describe('validateStepSize', () => {
    it.each(['10', '10m', '0.5km', '5mi', '12.34ft', '100'])(
      'accepts well-formed value %p', (v) => {
        expect(validateStepSize(v).valid).toBe(true)
      }
    )

    it.each(['10cm', 'abc', '10 m', 'm10', '-5m'])(
      'rejects malformed value %p', (v) => {
        expect(validateStepSize(v).valid).toBe(false)
      }
    )

    it('treats empty/whitespace as valid', () => {
      expect(validateStepSize('').valid).toBe(true)
      expect(validateStepSize('   ').valid).toBe(true)
    })
  })

  describe('validateUrl', () => {
    it.each([
      'https://example.com',
      'http://example.com/path?q=1',
      'https://sub.example.com:8080/foo'
    ])('accepts http(s) URL %p', (v) => {
      expect(validateUrl(v).valid).toBe(true)
    })

    it.each(['./local', '../up', '/abs/path'])(
      'accepts relative path %p', (v) => {
        expect(validateUrl(v).valid).toBe(true)
      }
    )

    it.each(['', '   ', undefined])(
      'treats empty %p as valid', (v) => {
        expect(validateUrl(v).valid).toBe(true)
      }
    )

    it.each([
      'javascript:alert(1)',
      'data:text/html,<script>x</script>',
      'file:///etc/passwd',
      'ftp://example.com'
    ])('rejects unsafe scheme %p', (v) => {
      expect(validateUrl(v).valid).toBe(false)
    })

    it('rejects garbage', () => {
      expect(validateUrl('not a url').valid).toBe(false)
    })
  })

  describe('validateRequired', () => {
    it('rejects empty/whitespace/undefined', () => {
      expect(validateRequired('').valid).toBe(false)
      expect(validateRequired('   ').valid).toBe(false)
      expect(validateRequired(undefined).valid).toBe(false)
    })

    it('accepts non-empty', () => {
      expect(validateRequired('hi').valid).toBe(true)
    })
  })

  describe('validateImageLayerUrl', () => {
    it.each([
      'https://services.example.com/arcgis/rest/services/World/ImageServer',
      'https://services.example.com/arcgis/rest/services/World/ImageServer/',
      'https://services.example.com/arcgis/rest/services/World/imageserver?token=1'
    ])('accepts ImageServer URL %p', (v) => {
      expect(validateImageLayerUrl(v).valid).toBe(true)
    })

    it.each([
      'https://example.com/map.png',
      'https://example.com/ImageServer/exportImage',
      './local.png',
      '',
      undefined
    ])('rejects non-ImageServer value %p', (v) => {
      expect(validateImageLayerUrl(v).valid).toBe(false)
    })
  })

  describe('visualBaseLayerTypeFromUrl', () => {
    it('selects image server for an ImageServer URL', () => {
      expect(visualBaseLayerTypeFromUrl('https://host/arcgis/rest/services/World/ImageServer')).toBe(VisualBaseLayerType.ImageServer)
    })

    it('selects image for any other valid URL', () => {
      expect(visualBaseLayerTypeFromUrl('https://example.com/overlay.png')).toBe(VisualBaseLayerType.Image)
      expect(visualBaseLayerTypeFromUrl('/overlays/base.png')).toBe(VisualBaseLayerType.Image)
    })

    it('does not select a type for empty or invalid values', () => {
      expect(visualBaseLayerTypeFromUrl('')).toBeUndefined()
      expect(visualBaseLayerTypeFromUrl('   ')).toBeUndefined()
      expect(visualBaseLayerTypeFromUrl(undefined)).toBeUndefined()
      expect(visualBaseLayerTypeFromUrl('not a url')).toBeUndefined()
      expect(visualBaseLayerTypeFromUrl('javascript:alert(1)')).toBeUndefined()
    })
  })
})
