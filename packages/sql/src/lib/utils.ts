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
