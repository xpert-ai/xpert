import {
  compact,
  FilteringLogic,
  FilterOperator,
  flatten,
  IFilter,
  IMember,
  isAdvancedFilter,
  isNumber,
  isString,
  PropertyLevel
} from '@metad/ocap-core'
import { CubeContext } from './cube'
import { createDimensionContext, DimensionContext } from './dimension'
import { And, Not, Or, Parentheses } from './functions'
import { allMemberName, serializeName, serializeTableAlias } from './utils'

// /**
//  * @deprecated use compileFilters
//  *
//  * 依据实体类型将过滤器转换成语句
//  *
//  * @param filters 过滤器
//  * @param entityType 实体类型
//  * @param dialect 方言
//  * @returns 过滤语句
//  */
// export function convertFiltersToSQL(filters: Array<IFilter>, entityType: EntityType, dialect?: string) {
//   return compact(flatten(filters.map((item) => convertFilterToSQL(item, entityType, dialect)))).join(' AND ')
// }

// export function convertSlicerToSQL(iSlicer: ISlicer, dialect?: string) {
//   if (isEmpty(iSlicer.members)) {
//     return ''
//   }

//   return `${iSlicer.dimension.dimension} ${iSlicer.exclude ? 'NOT ' : ''}IN (${iSlicer.members
//     .map(convertFilterValue)
//     .join(',')})`
// }

// export function convertFilterToSQL(slicer: ISlicer, entityType: EntityType, dialect: string) {
//   if (isAdvancedFilter(slicer)) {
//     return slicer.children
//       .map((child) => `( ${convertFilterToSQL(child, entityType, dialect)} )`)
//       .join(slicer.filteringLogic === FilteringLogic.And ? ' AND ' : ' OR ')
//   }

//   if (isEmpty(slicer.members)) {
//     return ''
//   }

//   const propertyName = getPropertyName(slicer.dimension)
//   // const property = getEntityProperty(entityType, propertyName)

//   const path = `${serializeName(entityType.name, dialect)}.${serializeName(propertyName, dialect)}`
//   // property.entitySet
//   //   ? `${serializeName(property.entitySet, dialect)}.${serializeName(
//   //       propertyName.replace(property.entitySet + '_', ''),
//   //       dialect
//   //     )}`
//   //   : `${serializeName(entityType.name, dialect)}.${serializeName(propertyName, dialect)}`

//   if (isFilter(slicer)) {
//     switch (slicer.operator) {
//       case FilterOperator.EQ:
//         if (isArray(slicer.members)) {
//           return `${path} IN (${slicer.members.map(convertFilterValue).join(', ')})`
//         }
//         return `${path} = ${convertFilterValue(slicer.members[0])}`
//       case FilterOperator.NE:
//         if (isArray(slicer.members)) {
//           return `${path} NOT IN (${slicer.members.map(convertFilterValue).join(', ')})`
//         }
//         return `${path} <> ${convertFilterValue(slicer.members)}`
//       case FilterOperator.BT:
//         return `${path} BETWEEN ${convertFilterValue(slicer.members[0])} AND ${convertFilterValue(slicer.members[1])}`
//       default:
//         console.warn(`Error: unplemented slicer`, slicer)
//         return '++++ Error: unplemented slicer ++++'
//     }
//   }

//   const inOperator = slicer.exclude ? 'NOT IN' : 'IN'

//   return `${path} ${inOperator} (${slicer.members.map(convertFilterValue).join(', ')})`
// }

export function convertFilterValue({ value }: IMember) {
  // if (isDate(value)) {
  //   return `datetime'${format(value as unknown as Date, HTML5_FMT_DATETIME_LOCAL_SECONDS)}'`
  // }
  if (isNumber(value)) {
    return value
  }

  if (isString(value)) {
    if (value.startsWith('datetime')) {
      return value
    }

    if (value === '') {
      return `'${value}'`
    }

    // escaping single quote
    return `'${value.replace(/'/g, "''")}'`
  }

  return `null`
}

export const MEMBER_VALUE_REGEX = new RegExp('\\[(.*?)\\]', 'g')

export function compileSlicer(slicer: IFilter, cube: CubeContext, dialect: string): string {
  const { entityType } = cube
  if (isAdvancedFilter(slicer)) {
    const children = slicer.children.map((child) => compileSlicer(child, cube, dialect)).filter(Boolean)
    return slicer.filteringLogic === FilteringLogic.And
      ? And(...Parentheses(...children))
      : Or(...Parentheses(...children))
  }

  const factTable = cube.factTable
  let dimensionContext = cube.dimensions.find((item) => item.dimension.dimension === slicer.dimension.dimension)
  if (!dimensionContext) {
    dimensionContext = createDimensionContext(entityType, slicer.dimension)
    dimensionContext.dialect = dialect
    dimensionContext.factTable = factTable
    cube.dimensions.push(dimensionContext)
  }

  if (dimensionContext.hierarchy.name !== (slicer.dimension.hierarchy || slicer.dimension.dimension)) {
    throw new Error(
      `不能同时查询不同层级结构${dimensionContext.hierarchy.name}和${
        slicer.dimension.hierarchy || slicer.dimension.dimension
      }`
    )
  }

  const levels = dimensionContext.hierarchy.levels.slice(dimensionContext.hierarchy.hasAll ? 1 : 0)

  const operator = (<IFilter>slicer).operator
  if (operator === FilterOperator.BT) {
    const btMembers = compileMembers(slicer.members, levels, dimensionContext)
    const statement = And(
      ...Parentheses(
        serializeCPMembers(btMembers[0], FilterOperator.GE),
        serializeCPMembers(btMembers[1], FilterOperator.LE)
      )
    )

    return slicer.exclude ? Not(statement) : statement
  }

  const conditions = compileMembers(slicer.members, levels, dimensionContext)
    .map((members: Array<string | { columnName: string; value: string }>) => {
      switch (operator) {
        case FilterOperator.GT:
        case FilterOperator.GE:
        case FilterOperator.LT:
        case FilterOperator.LE:
          return serializeCPMembers(members, operator)
        case FilterOperator.NE:
          return Not(serializeEQMembers(members))
        case FilterOperator.EQ:
          return serializeEQMembers(members)
        default:
          if (!operator) {
            return serializeEQMembers(members)
          }
          throw new Error(`Not implement operator '${operator}'`)
      }
    })
    .filter((value) => !!value)

  return slicer.exclude ? And(...conditions.map((item) => Not(item))) : Or(...Parentheses(...conditions))
}

export function compileFilters(filters: Array<IFilter>, cube: CubeContext, dialect?: string) {
  return And(...Parentheses(...compact(flatten(filters.map((item) => compileSlicer(item, cube, dialect))))))
}

export function compileMembers(members: IMember[], levels: PropertyLevel[], dimensionContext: DimensionContext) {
  return members.map((member) => {
    return `${member.value}`
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split('].[')
      .filter(
        (value, i) =>
          !(i === 0 && dimensionContext.hierarchy.hasAll && allMemberName(dimensionContext.hierarchy) === value)
      )
      .map((value, i) => {
        const level = levels[i]
        const levelTable = level.table || dimensionContext.dimensionTable

        const levelColumn = level.nameColumn || level.column

        if (!levelColumn) {
          throw new Error(
            `Can't find table column for level '${level.name}' of dimension '${dimensionContext.dimension.dimension}'`
          )
        }

        const columnName = `${serializeName(
          levelTable ? serializeTableAlias(dimensionContext.hierarchy.name, levelTable) : dimensionContext.factTable,
          dimensionContext.dialect
        )}.${serializeName(levelColumn, dimensionContext.dialect)}`

        if (value === '#') {
          return `${columnName} IS NULL`
        }

        if (level.type !== 'Numeric' && level.type !== 'Integer') {
          value = `'${value}'`
        }

        return { columnName, value }
      })
  })
}

export function serializeCPMembers(
  members: Array<string | { columnName: string; value: string }>,
  operator: FilterOperator
) {
  let op = '='
  switch (operator) {
    case FilterOperator.GT:
    case FilterOperator.GE:
      op = '>'
      break
    case FilterOperator.LT:
    case FilterOperator.LE:
      op = '<'
      break
  }

  const conditions = members.reduce((conditions, member, currentIndex) => {
    const conditionGroup = [
      ...members
        .slice(0, currentIndex)
        .map((member) => (isString(member) ? member : `${member.columnName} = ${member.value}`)),
      isString(member) ? member : `${member.columnName} ${op} ${member.value}`
    ]
    conditions.push(conditionGroup.length === 1 ? conditionGroup[0] : `( ${And(...conditionGroup)} )`)
    return conditions
  }, [])

  if ([FilterOperator.GE, FilterOperator.LE].includes(operator)) {
    conditions.push(`( ${serializeEQMembers(members)} )`)
  }
  return Or(...conditions)
}

export function serializeEQMembers(members: Array<string | { columnName: string; value: string }>) {
  return And(...members.map((member) => (isString(member) ? member : `${member.columnName} = ${member.value}`)))
}
