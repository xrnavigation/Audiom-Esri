import { describe, it, expect } from 'vitest';
import {
  TimeInstant,
  TimeExtent,
  IntervalUnit,
  CompoundIntervalUnit,
  interval,
  intervalToString
} from './temporal/EsriTemporalFilter';

describe('TimeInstant', () => {
  it('fromEpochMs() stores epoch ms', () => {
    const ti = TimeInstant.fromEpochMs(1700000000000);
    expect(ti.epochMs).toBe(1700000000000);
  });

  it('fromDate() converts Date to epoch ms', () => {
    const d = new Date(Date.UTC(2024, 5, 15, 12, 0, 0));
    const ti = TimeInstant.fromDate(d);
    expect(ti.epochMs).toBe(d.getTime());
  });

  it('toQueryParam() returns epoch ms string', () => {
    const ti = TimeInstant.fromEpochMs(1700000000000);
    expect(ti.toQueryParam()).toBe('1700000000000');
  });

  it('toTimestampLiteral() formats correctly', () => {
    const d = new Date(Date.UTC(2024, 0, 15, 10, 30, 0));
    const ti = TimeInstant.fromDate(d);
    expect(ti.toTimestampLiteral()).toBe("TIMESTAMP '2024-01-15 10:30:00'");
  });

  it('toTimestampLiteral() zero-pads single-digit components', () => {
    const d = new Date(Date.UTC(2024, 0, 5, 3, 7, 9));
    const ti = TimeInstant.fromDate(d);
    expect(ti.toTimestampLiteral()).toBe("TIMESTAMP '2024-01-05 03:07:09'");
  });
});

describe('TimeExtent', () => {
  it('create() stores start and end instants', () => {
    const start = TimeInstant.fromEpochMs(1000);
    const end = TimeInstant.fromEpochMs(2000);
    const extent = TimeExtent.create(start, end);
    expect(extent.start).toBe(start);
    expect(extent.end).toBe(end);
  });

  it('fromEpochMs() converts ms values', () => {
    const extent = TimeExtent.fromEpochMs(1000, 2000);
    expect(extent.start!.epochMs).toBe(1000);
    expect(extent.end!.epochMs).toBe(2000);
  });

  it('fromEpochMs() supports null for open-ended ranges', () => {
    const fromStart = TimeExtent.fromEpochMs(null, 2000);
    expect(fromStart.start).toBeNull();
    expect(fromStart.end!.epochMs).toBe(2000);

    const toEnd = TimeExtent.fromEpochMs(1000, null);
    expect(toEnd.start!.epochMs).toBe(1000);
    expect(toEnd.end).toBeNull();
  });

  it('fromDates() converts Date objects', () => {
    const d1 = new Date(Date.UTC(2024, 0, 1));
    const d2 = new Date(Date.UTC(2024, 11, 31));
    const extent = TimeExtent.fromDates(d1, d2);
    expect(extent.start!.epochMs).toBe(d1.getTime());
    expect(extent.end!.epochMs).toBe(d2.getTime());
  });

  it('fromDates() supports null for open-ended ranges', () => {
    const extent = TimeExtent.fromDates(null, new Date(Date.UTC(2024, 0, 1)));
    expect(extent.start).toBeNull();
  });

  it('toQueryParam() returns comma-separated epoch ms', () => {
    const extent = TimeExtent.fromEpochMs(1000, 2000);
    expect(extent.toQueryParam()).toBe('1000,2000');
  });

  it('toQueryParam() uses null for open ends', () => {
    expect(TimeExtent.fromEpochMs(null, 2000).toQueryParam()).toBe('null,2000');
    expect(TimeExtent.fromEpochMs(1000, null).toQueryParam()).toBe('1000,null');
  });
});

describe('interval()', () => {
  it('creates an IntervalExpression with simple unit', () => {
    const expr = interval('3', IntervalUnit.Day);
    expect(expr).toEqual({ value: '3', unit: 'DAY' });
  });

  it('creates an IntervalExpression with compound unit', () => {
    const expr = interval('3 05:32:28', CompoundIntervalUnit.DayToSecond);
    expect(expr).toEqual({ value: '3 05:32:28', unit: 'DAY TO SECOND' });
  });
});

describe('intervalToString()', () => {
  it('produces correct SQL fragment for simple unit', () => {
    expect(intervalToString(interval('7', IntervalUnit.Day))).toBe("INTERVAL '7' DAY");
  });

  it('produces correct SQL fragment for compound unit', () => {
    expect(intervalToString(interval('1 12:00:00', CompoundIntervalUnit.DayToSecond)))
      .toBe("INTERVAL '1 12:00:00' DAY TO SECOND");
  });

  it('serializes all IntervalUnit values', () => {
    expect(intervalToString(interval('30', IntervalUnit.Minute))).toBe("INTERVAL '30' MINUTE");
    expect(intervalToString(interval('2', IntervalUnit.Hour))).toBe("INTERVAL '2' HOUR");
    expect(intervalToString(interval('45', IntervalUnit.Second))).toBe("INTERVAL '45' SECOND");
  });
});
