/**
 * Query options for field selection, sorting, and pagination.
 *
 * These map directly to Esri feature service query parameters but are
 * general enough to apply to OGC API and other sources.
 *
 * @see https://developers.arcgis.com/rest/services-reference/enterprise/query-feature-service-layer/
 */

// ── Sort order ──────────────────────────────────────────────────────

export enum SortOrder {
  Ascending = 'ASC',
  Descending = 'DESC'
}

// ── Order-by clause ─────────────────────────────────────────────────

export interface OrderByField {
  field: string;
  order?: SortOrder;
}

/**
 * Create an order-by clause for a single field.
 *
 * @example
 * ```ts
 * orderBy('name')                        // name ASC (default)
 * orderBy('population', SortOrder.Descending)  // population DESC
 * ```
 */
export function orderBy(field: string, order?: SortOrder): OrderByField {
  return { field, order };
}

/**
 * Serialize an array of OrderByField entries to the Esri `orderByFields` format.
 *
 * @example
 * ```ts
 * orderByFieldsToString([orderBy('name'), orderBy('pop', SortOrder.Descending)])
 * // → "name ASC, pop DESC"
 * ```
 */
export function orderByFieldsToString(fields: OrderByField[]): string {
  return fields
    .map(entry => `${entry.field} ${entry.order ?? SortOrder.Ascending}`)
    .join(', ');
}

// ── Pagination ──────────────────────────────────────────────────────

export interface PaginationOptions {
  /** Maximum number of records to return. */
  count: number;
  /** Number of records to skip (zero-based offset). */
  offset?: number;
}
