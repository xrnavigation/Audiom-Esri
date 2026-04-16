/**
 * Backward-compatible re-export of the Esri SQL serializer.
 *
 * New code should import `toEsriSql` from `./serializers/EsriSqlSerializer`
 * or the `serializers` barrel. The `toString` alias is kept so existing
 * consumers continue to work without changes.
 *
 * @deprecated Use `toEsriSql` from `./serializers` instead.
 */

import { toEsriSql } from './serializers/EsriSqlSerializer';

/**
 * Serialize an Expression AST node to an Esri SQL-92 string.
 *
 * @deprecated Use `toEsriSql` from `./serializers` instead.
 */
export const toString = toEsriSql;
