import { Transform } from 'stream'
import { IColumnDef, IDSSchema } from './types'


/**
 * Analyze the field type based on the SQL query result object
 *
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof
 *
 * @param obj
 * @returns
 */
export function typeOfObj(obj) {
  return Object.entries(obj).map(([key, value]) => ({
    name: key,
    type: value === null || value === undefined ? null : typeof value
  }))
}

export function convertMySQLSchema(data: Array<any>) {
  const schemas = groupBy(data, 'table_schema')
  return Object.keys(schemas).map((schema) => {
    const tableGroup = groupBy(schemas[schema], 'table_name')
    const tables = Object.keys(tableGroup).map((name) => {
      return {
        schema,
        name,
        label: tableGroup[name][0].table_comment,
        type: tableGroup[name][0].table_type,
        columns: tableGroup[name]
          .filter((item) => !!item.column_name)
          .map((item) => ({
            name: item.column_name,
            dataType: item.data_type,
            type: pgTypeMap(item.data_type),
            label: item.column_comment
          }))
      }
    })

    return {
      schema,
      name: schema,
      tables
    }
  })
}

export function getPGSchemaQuery(schemaName: string, tableName: string) {
  const tableSchema = schemaName
    ? `table_schema = '${schemaName}'`
    : `table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast', 'pg_toast_temp_1', 'pg_temp_1')`
  let query = ''
  if (tableName) {
    query = `SELECT cols.table_schema, cols.table_name, cols.column_name, cols.data_type, cols.character_maximum_length, cols.ordinal_position, cols.is_nullable, pg_catalog.col_description(c.oid, cols.ordinal_position::int) as column_comment, pg_catalog.obj_description(c.oid, 'pg_class') as table_comment FROM pg_catalog.pg_class c, information_schema.columns cols WHERE ${tableSchema} AND cols.table_name = '${tableName}' AND cols.table_name = c.relname ORDER BY ordinal_position`
  } else {
    query = `SELECT table_schema, t.table_name, pg_catalog.obj_description(pgc.oid, 'pg_class') as table_comment FROM information_schema.tables t INNER JOIN pg_catalog.pg_class pgc ON t.table_name = pgc.relname WHERE ${tableSchema}`
  }
  return query
}

export function convertPGSchema(data: any[]): IDSSchema[] {
  const schemas = groupBy(data, 'table_schema')
  return Object.keys(schemas).map((schema) => {
    const tableGroup = groupBy(schemas[schema], 'table_name')
    const tables = Object.keys(tableGroup).map((name) => {
      return {
        schema,
        name,
        label: tableGroup[name][0].table_comment,
        type: tableGroup[name][0].table_type,
        columns: tableGroup[name]
          .filter((item) => !!item.column_name)
          .map((item) => ({
            name: item.column_name,
            type: pgTypeMap(item.data_type),
            label: item.column_comment,
            dataType: item.data_type,
            dataLength: item.character_maximum_length,
            position: item.ordinal_position
          } as IColumnDef))
      }
    })

    return {
      schema,
      name: schema,
      tables
    } as IDSSchema
  })
}

export function pgTypeMap(type: string): string {
  switch (type) {
    case 'numeric':
    case 'int':
    case 'int 4':
    case 'int4':
    case 'int 8':
    case 'int8':
    case 'integer':
    case 'float':
    case 'float 8':
    case 'float8':
    case 'double':
    case 'real':
    case 'bigint':
    case 'smallint':
    case 'double precision':
    case 'decimal':
      return 'number'
    case 'uuid':
    case 'varchar':
    case 'character varying':
    case 'longtext':
    case 'text':
      return 'string'
    case 'timestamp without time zone':
      return 'timestamp'
    case 'json':
      return 'object'
    default:
      return type
  }
}

/**
 * Convert frontend type to Postgres column type
 * 
 * @param type string number boolean date datetime object
 * @param isKey 
 * @param length 
 * @returns 
 */
export function typeToPGDB(type: string, isKey: boolean, length: number) {
  switch(type) {
    case 'number':
    case 'Number':
      return 'INT'
    case 'Numeric':
      return 'float8'
    case 'string':
    case 'String':
      // Max length 3072 btye for primary key
      if (length !== null && length !== undefined) {
        return isKey ? `VARCHAR(${Math.min(length, 768)})` : `VARCHAR(${length})`
      }
      return isKey ? 'VARCHAR(768)' : 'VARCHAR(1000)'
    case 'date':
    case 'Date':
      return 'DATE'
    case 'Datetime':
    case 'datetime':
      return 'TIMESTAMP'
    case 'Time':
      return 'TIME'
    case 'boolean':
    case 'Boolean':
      return 'BOOLEAN'
    case 'object':
      return 'JSONB'
    default:
      return 'VARCHAR(1000)'
  }
}

export function typeToMySqlDB(type: string, isKey: boolean, length: number) {
  switch(type) {
    case 'number':
    case 'Number':
      return 'INT'
    case 'Numeric':
      return 'DOUBLE'
    case 'string':
    case 'String':
      // Max length 3072 btye for primary key
      if (length !== null && length !== undefined) {
        return isKey ? `VARCHAR(${Math.min(length, 768)})` : `VARCHAR(${length})`
      }
      return isKey ? 'VARCHAR(768)' : 'VARCHAR(1000)'
    case 'date':
    case 'Date':
      return 'DATE'
    case 'Datetime':
    case 'datetime':
      return 'DATETIME'
    case 'boolean':
    case 'Boolean':
      return 'BOOLEAN'
    default:
      return 'VARCHAR(1000)'
  }
}

export function typeToStarrocksDB(type: string, length: number, fraction?: number) {
  switch(type) {
    case 'number':
    case 'Number':
      return 'INT'
    case 'Numeric':
      return `DECIMAL(${length ?? 27}, ${fraction ?? 9})`
    case 'string':
    case 'String':
      return `VARCHAR(${length ?? 1000})`
    case 'date':
    case 'Date':
      return 'DATE'
    case 'Datetime':
    case 'datetime':
      return 'DATETIME'
    case 'boolean':
    case 'Boolean':
      return 'BOOLEAN'
    default:
      return 'STRING'
  }
}

export function groupBy(arr: any[], key: string) {
  return arr.reduce((prev, curr) => {
    prev[curr[key]] = prev[curr[key]] ?? []
    prev[curr[key]].push(curr)
    return prev
  }, {})
}

export function pick(object, keys) {
  return keys.reduce((obj, key) => {
     // eslint-disable-next-line no-prototype-builtins
     if (object && object.hasOwnProperty(key)) {
        obj[key] = object[key];
     }
     return obj;
   }, {});
}

export class SkipHeaderTransformStream extends Transform {
  headerSkipped = false;
  _transform(chunk, encoding, callback) {
    // Convert the chunk to a string
    const data = chunk.toString();

    // Split the data into lines
    const lines = data.split('\n');

    // If the header line has not been skipped yet, remove it
    if (!this.headerSkipped) {
      lines.shift(); // Remove the first line (header line)
      this.headerSkipped = true;
    }

    // Join the remaining lines and pass them along
    const transformedData = lines.join('\n');
    this.push(transformedData);

    // Call the callback to indicate that the transformation is complete for this chunk
    callback();
  }
}
