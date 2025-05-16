import { AggregationRole, EntityType, measureFormatter, PivotColumn, PropertyDimension, PropertyHierarchy, PropertyLevel } from '@metad/ocap-core'
import { serializeUniqueName } from '@metad/ocap-sql'
import { uuid } from '../../../@core'

export function serializePropertyUniqueName(property: PropertyLevel, dialect: string) {
  switch (property.role) {
    case AggregationRole.dimension:
      return serializeUniqueName(dialect, property.name)
    case AggregationRole.hierarchy:
      return serializeUniqueName(dialect, property.dimension, property.name)
    case AggregationRole.level:
      return serializeUniqueName(dialect, property.dimension, property.hierarchy, property.name)
    case AggregationRole.measure:
      return measureFormatter(property.name)
    default:
      return property.name
  }
}



// convert to Postgres default ISO 8601 format
function formatDate(date: string) {
  date = date.replace('T', ' ')
  date = date.replace('Z', '+00')
  return date
}

function arrayToList(useSpace: boolean, array, formatter) {
  var sql = ''
  // var temp = []

  sql += useSpace ? ' (' : '('
  for (var i = 0; i < array.length; i++) {
    sql += (i === 0 ? '' : ', ') + formatter(array[i])
  }
  sql += ')'

  return sql
}


// Ported from PostgreSQL 9.2.4 source code in src/interfaces/libpq/fe-exec.c
export function quoteLiteral(value: any) {
  var literal = null
  var explicitCast = null

  if (value === undefined || value === null) {
    return 'NULL'
  } else if (value === false) {
    return "'f'"
  } else if (value === true) {
    return "'t'"
  } else if (value instanceof Date) {
    return "'" + formatDate(value.toISOString()) + "'"
  } else if (Array.isArray(value) === true) {
    var temp = []
    for (var i = 0; i < value.length; i++) {
      if (Array.isArray(value[i]) === true) {
        temp.push(arrayToList(i !== 0, value[i], quoteLiteral))
      } else {
        temp.push(quoteLiteral(value[i]))
      }
    }
    return temp.toString()
  } else if (value === Object(value)) {
    explicitCast = 'jsonb'
    literal = JSON.stringify(value)
  } else {
    literal = value.toString().slice(0) // create copy
  }

  var hasBackslash = false
  var quoted = "'"

  for (var i = 0; i < literal.length; i++) {
    var c = literal[i]
    if (c === "'") {
      quoted += c + c
    } else if (c === '\\') {
      quoted += c + c
      hasBackslash = true
    } else {
      quoted += c
    }
  }

  quoted += "'"

  if (hasBackslash === true) {
    quoted = 'E' + quoted
  }

  if (explicitCast) {
    quoted += '::' + explicitCast
  }

  return quoted
}

export function stringifyEntityType(entityType: EntityType) {
  return `Entity ${entityType.name} (${Object.values(entityType.properties).map((property) => `${property.name} ${property.dataType ?? ''} ${property.caption ?? ''}`).join(', ')})`
}

export function stringifyTableType(entityType: EntityType) {
  return `Table "${entityType.name}" (${Object.values(entityType.properties).map((property) => `${property.name} ${property.dataType ?? ''} ${property.caption ?? ''}`).join(', ')})`
}

export function markdownTableData({data, columns}: {data: any[], columns: PivotColumn[]}) {
  const header = columns.map((column) => column.name).join(' | ')
  const divider = columns.map(() => '---').join(' | ')
  const rows = data.map((row) => columns.map((column) => row[column.name]).join(' | ')).join('\n')
  return `${header}\n${divider}\n${rows}`
}

export function upsertHierarchy(dimension: PropertyDimension, hierarchy: Partial<PropertyHierarchy>) {
  let key = null
  const index = dimension.hierarchies.findIndex((item) => item.name === hierarchy.name)
  if (index > -1) {
    dimension.hierarchies.splice(index, 1, {
      ...dimension.hierarchies[index],
      ...hierarchy
    })
    key = dimension.hierarchies[index].__id__
  } else {
    dimension.hierarchies.push({ ...hierarchy, __id__: hierarchy.__id__ ?? uuid() } as PropertyHierarchy)
    key = dimension.hierarchies[dimension.hierarchies.length - 1].__id__
  }

  return key
}

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
    type: value === null || value === undefined ? null : typeof value
  }))
}
