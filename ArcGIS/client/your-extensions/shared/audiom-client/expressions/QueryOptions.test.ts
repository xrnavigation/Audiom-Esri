import { describe, it, expect } from 'vitest';
import { SortOrder, orderBy, orderByFieldsToString } from './QueryOptions';
import type { PaginationOptions } from './QueryOptions';

describe('SortOrder enum', () => {
  it('maps to SQL keywords', () => {
    expect(SortOrder.Ascending).toBe('ASC');
    expect(SortOrder.Descending).toBe('DESC');
  });
});

describe('orderBy', () => {
  it('creates an ascending field by default', () => {
    const entry = orderBy('name');
    expect(entry).toEqual({ field: 'name' });
  });

  it('creates a field with explicit sort order', () => {
    const entry = orderBy('population', SortOrder.Descending);
    expect(entry).toEqual({ field: 'population', order: SortOrder.Descending });
  });
});

describe('orderByFieldsToString', () => {
  it('serializes a single field with default ascending', () => {
    expect(orderByFieldsToString([orderBy('name')])).toBe('name ASC');
  });

  it('serializes a single field with explicit descending', () => {
    expect(orderByFieldsToString([orderBy('population', SortOrder.Descending)])).toBe('population DESC');
  });

  it('serializes multiple fields comma-separated', () => {
    const result = orderByFieldsToString([
      orderBy('state'),
      orderBy('population', SortOrder.Descending),
      orderBy('name', SortOrder.Ascending),
    ]);
    expect(result).toBe('state ASC, population DESC, name ASC');
  });

  it('returns empty string for empty array', () => {
    expect(orderByFieldsToString([])).toBe('');
  });
});

describe('PaginationOptions', () => {
  it('supports count only', () => {
    const options: PaginationOptions = { count: 50 };
    expect(options.count).toBe(50);
    expect(options.offset).toBeUndefined();
  });

  it('supports count and offset', () => {
    const options: PaginationOptions = { count: 25, offset: 100 };
    expect(options.count).toBe(25);
    expect(options.offset).toBe(100);
  });
});
