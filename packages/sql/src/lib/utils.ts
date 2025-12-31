import { AggregationRole, isNil, PropertyHierarchy, SQL } from '@metad/ocap-core'
import { C_ALL_MEMBER_CAPTION, C_ALL_MEMBER_NAME } from './types'

/**
 * 根据 SQL 查询结果对象分析出字段类型
 *
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof
 *
 * @param obj
 * @returns
 */
export function typeOfObj(obj) {
  return Object.entries(obj).map(([key, value]) => ({
    name: key,
    label: key,
    type: isNil(value) ? null : typeof value
  }))
}

export function decideRole(type: string) {
  switch (type) {
    case 'string':
      return AggregationRole.dimension
    case 'number':
      return AggregationRole.measure
    default:
      return AggregationRole.dimension
  }
}

/**
 * TODO 不同的数据库需要拼出不同的字段名格式 ? 有没有最佳实践 ?
 *
 * @param name
 * @param dialect
 * @returns
 */
export function serializeName(name: string, dialect: string, catalog?: string) {
  // Validate name is not empty to prevent "zero-length delimited identifier" errors
  if (!name || (typeof name === 'string' && !name.trim())) {
    throw new Error(`Cannot serialize empty or null identifier. Name: '${name}'`)
  }
  
  if (['duckdb'].includes(dialect) && catalog) {
    return `"${catalog}"."${name}"`
  }

  if (['pg', 'trino', 'presto', 'duckdb', 'hana', 'mssql'].includes(dialect)) {
    return `"${name}"`
  }

  if (['hive'].includes(dialect) && catalog) {
    return `\`${catalog}\`.\`${name}\``
  }

  return `\`${name}\``
}

export function serializeWrapCatalog(expression: string, dialect: string, catalog: string) {
  if (['pg'].includes(dialect) && catalog) {
    return `SET search_path TO ${catalog};${expression}`
  }
  return expression
}

export function serializeMemberCaption(name: string) {
  return `${name}.[MEMBER_CAPTION]`
}

export function serializeUniqueName(
  dialect: string,
  dimension: string,
  hierarchy?: string,
  level?: string,
  intrinsic?: string
) {
  const separator = ['hive'].includes(dialect) ? '|' : '.'
  const connector = ['hive'].includes(dialect) ? '' : '.'
  let name = !!hierarchy && dimension !== hierarchy ? `[${dimension}${separator}${hierarchy}]` : `[${dimension}]`

  if (intrinsic) {
    name = `${name}${connector}[${level}]${connector}[${intrinsic}]`
  } else if (level) {
    name = `${name}${connector}[${level}]`
  }

  if (isCaseInsensitive(dialect)) {
    name = name.toLowerCase()
  }

  return name
}

export function serializeIntrinsicName(dialect: string, base: string, intrinsic: string) {
  const connector = ['hive'].includes(dialect) ? '' : '.'
  let name = `${base}${connector}[${intrinsic}]`

  if (isCaseInsensitive(dialect)) {
    name = name.toLowerCase()
  }

  return name
}

export function serializeMeasureName(dialect: string, measure: string) {
  if (isCaseInsensitive(dialect)) {
    measure = measure.toLowerCase()
  }

  return measure
}

export function isCaseInsensitive(dialect: string) {
  return ['hive'].includes(dialect)
}

export function serializeTableAlias(hierarchy: string, table: string) {
  // Validate inputs to prevent invalid aliases like "[]_tablename"
  if (!hierarchy || !hierarchy.trim()) {
    // If no hierarchy prefix, just return the table name
    return table
  }
  if (!table || !table.trim()) {
    throw new Error(`Cannot create table alias: table name is empty (hierarchy: '${hierarchy}')`)
  }
  return hierarchy.replace(/\s/g, '_').toLowerCase() + '_' + table
}

export function isSQLDialect(sql: SQL, dialect: string) {
  return !sql.dialect || sql.dialect === 'generic' || sql.dialect === dialect
}

export function limitSelect(statement: string, limit: number, dialect: string) {
  if (['mssql'].includes(dialect)) {
    return `SELECT TOP ${limit} * FROM ${statement}`
  }

  return `SELECT * FROM ${statement} LIMIT ${limit}`
}

export function getErrorMessage(err: any): string {
  let error: string
  if (typeof err === 'string') {
    error = err
  } else if (err instanceof Error) {
    error = err?.message
  } else if (err?.error instanceof Error) {
    error = err?.error?.message
  } else {
    error = err
  }

  return error
}

export function allLevelName(hierarchy: PropertyHierarchy, dialect: string) {
  const allLevelName = allLevelCaption(hierarchy)
  const allLevelUniqueName = serializeUniqueName(dialect, hierarchy.dimension, hierarchy.name, allLevelName)
  return allLevelUniqueName
}
export function allLevelCaption(hierarchy: PropertyHierarchy) {
  return hierarchy.allLevelName || `(All ${hierarchy.name || hierarchy.dimension}s)`
}
export function allMemberName(hierarchy: PropertyHierarchy) {
  return hierarchy.allMemberName || C_ALL_MEMBER_NAME
}
export function allMemberCaption(hierarchy: PropertyHierarchy) {
  return hierarchy.allMemberCaption || C_ALL_MEMBER_CAPTION
}

/**
 * Parse column reference that may include table prefix
 * Supports formats:
 *   - "fieldName" -> { table: null, column: "fieldName" }
 *   - "tableName.fieldName" -> { table: "tableName", column: "fieldName" }
 *   - "[tableName].[fieldName]" -> { table: "tableName", column: "fieldName" }
 * 
 * @param columnRef Column reference string
 * @returns Parsed table and column names
 */
export function parseColumnReference(columnRef: string): { table: string | null; column: string } {
  if (!columnRef || typeof columnRef !== 'string') {
    return { table: null, column: columnRef || '' }
  }
  
  const cleaned = columnRef.trim()
  
  // Check if contains dot (table.column format)
  if (cleaned.includes('.')) {
    const parts = cleaned.split('.')
    if (parts.length === 2) {
      // Clean both table and column names (remove brackets, quotes)
      const table = cleanSqlDelimiters(parts[0])
      const column = cleanSqlDelimiters(parts[1])
      return { table, column }
    }
  }
  
  // No table prefix, just column name
  return { table: null, column: cleanSqlDelimiters(cleaned) }
}

/**
 * Clean SQL delimiters from a name (brackets, quotes, backticks)
 * Examples:
 *   - "[uuid]" -> "uuid"
 *   - '"field"' -> "field"
 *   - "`field`" -> "field"
 * 
 * @param name Name to clean
 * @returns Cleaned name without SQL delimiters
 */
export function cleanSqlDelimiters(name: string): string {
  if (!name || typeof name !== 'string') {
    return name || ''
  }
  
  let cleaned = name.trim()
  
  // Remove square brackets: [field] -> field
  if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
    cleaned = cleaned.slice(1, -1)
  }
  // Remove double quotes: "field" -> field
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1)
  }
  // Remove backticks: `field` -> field
  if (cleaned.startsWith('`') && cleaned.endsWith('`')) {
    cleaned = cleaned.slice(1, -1)
  }
  // Remove single quotes: 'field' -> field
  if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
    cleaned = cleaned.slice(1, -1)
  }
  
  return cleaned
}

/**
 * Serialize column with proper table reference for multi-table scenarios
 * 
 * @param column Column name (may include table prefix like "table.column")
 * @param defaultTable Default table to use if column has no table prefix
 * @param dialect SQL dialect
 * @returns Serialized column reference like "table"."column"
 */
export function serializeColumnWithTable(column: string, defaultTable: string, dialect: string): string {
  const { table, column: columnName } = parseColumnReference(column)
  const tableName = table || defaultTable
  
  if (tableName) {
    return `${serializeName(tableName, dialect)}.${serializeName(columnName, dialect)}`
  }
  
  return serializeName(columnName, dialect)
}