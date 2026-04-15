import { describe, it, expect } from 'vitest';
import { DateTimeInstant, DateTimeInterval, toRfc3339 } from './DateTimeFilter';

describe('toRfc3339', () => {
  it('formats a Date as RFC 3339 UTC string', () => {
    const date = new Date(Date.UTC(2018, 1, 12, 23, 20, 52));
    expect(toRfc3339(date)).toBe('2018-02-12T23:20:52Z');
  });

  it('pads single-digit months and days', () => {
    const date = new Date(Date.UTC(2024, 0, 5, 3, 7, 9));
    expect(toRfc3339(date)).toBe('2024-01-05T03:07:09Z');
  });
});

describe('DateTimeInstant', () => {
  describe('fromDate', () => {
    it('creates an instant from a Date', () => {
      const date = new Date(Date.UTC(2024, 5, 15, 12, 0, 0));
      const instant = DateTimeInstant.fromDate(date);
      expect(instant.date.getTime()).toBe(date.getTime());
    });

    it('creates a defensive copy of the input Date', () => {
      const date = new Date(Date.UTC(2024, 5, 15, 12, 0, 0));
      const instant = DateTimeInstant.fromDate(date);
      date.setUTCFullYear(2000);
      expect(instant.date.getUTCFullYear()).toBe(2024);
    });
  });

  describe('fromIsoString', () => {
    it('creates an instant from an ISO string', () => {
      const instant = DateTimeInstant.fromIsoString('2018-02-12T23:20:52Z');
      expect(instant.toRfc3339()).toBe('2018-02-12T23:20:52Z');
    });
  });

  describe('toRfc3339', () => {
    it('serializes to RFC 3339 format', () => {
      const instant = DateTimeInstant.fromDate(new Date(Date.UTC(2024, 0, 15, 10, 30, 0)));
      expect(instant.toRfc3339()).toBe('2024-01-15T10:30:00Z');
    });
  });

  describe('toOverpassDateSetting', () => {
    it('serializes to Overpass date setting', () => {
      const instant = DateTimeInstant.fromDate(new Date(Date.UTC(2024, 0, 15, 10, 30, 0)));
      expect(instant.toOverpassDateSetting()).toBe('[date:"2024-01-15T10:30:00Z"]');
    });
  });
});

describe('DateTimeInterval', () => {
  const start = new Date(Date.UTC(2024, 0, 1, 0, 0, 0));
  const end = new Date(Date.UTC(2024, 5, 30, 23, 59, 59));

  describe('create', () => {
    it('creates an interval with start and end', () => {
      const interval = DateTimeInterval.create(start, end);
      expect(interval.start!.getTime()).toBe(start.getTime());
      expect(interval.end!.getTime()).toBe(end.getTime());
    });

    it('creates a defensive copy of input dates', () => {
      const s = new Date(Date.UTC(2024, 0, 1));
      const interval = DateTimeInterval.create(s, null);
      s.setUTCFullYear(2000);
      expect(interval.start!.getUTCFullYear()).toBe(2024);
    });

    it('allows null start (open start)', () => {
      const interval = DateTimeInterval.create(null, end);
      expect(interval.start).toBeNull();
      expect(interval.end).not.toBeNull();
    });

    it('allows null end (open end)', () => {
      const interval = DateTimeInterval.create(start, null);
      expect(interval.start).not.toBeNull();
      expect(interval.end).toBeNull();
    });
  });

  describe('toOgcDateTimeParam', () => {
    it('formats a closed interval as start/end', () => {
      const interval = DateTimeInterval.create(start, end);
      expect(interval.toOgcDateTimeParam()).toBe(
        '2024-01-01T00:00:00Z/2024-06-30T23:59:59Z'
      );
    });

    it('formats an open-start interval as ../end', () => {
      const interval = DateTimeInterval.create(null, end);
      expect(interval.toOgcDateTimeParam()).toBe(
        '../2024-06-30T23:59:59Z'
      );
    });

    it('formats an open-end interval as start/..', () => {
      const interval = DateTimeInterval.create(start, null);
      expect(interval.toOgcDateTimeParam()).toBe(
        '2024-01-01T00:00:00Z/..'
      );
    });

    it('formats a fully open interval as ../..', () => {
      const interval = DateTimeInterval.create(null, null);
      expect(interval.toOgcDateTimeParam()).toBe('../..');
    });
  });

  describe('toOverpassDiffSetting', () => {
    it('formats a closed interval as [diff:"start","end"]', () => {
      const interval = DateTimeInterval.create(start, end);
      expect(interval.toOverpassDiffSetting()).toBe(
        '[diff:"2024-01-01T00:00:00Z","2024-06-30T23:59:59Z"]'
      );
    });

    it('formats an open-end interval as [diff:"start"]', () => {
      const interval = DateTimeInterval.create(start, null);
      expect(interval.toOverpassDiffSetting()).toBe(
        '[diff:"2024-01-01T00:00:00Z"]'
      );
    });

    it('throws if start is null', () => {
      const interval = DateTimeInterval.create(null, end);
      expect(() => interval.toOverpassDiffSetting()).toThrow(
        'Overpass diff requires a start date'
      );
    });
  });
});
