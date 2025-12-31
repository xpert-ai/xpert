import {
  compact,
  FilteringLogic,
  FilterOperator,
  flatten,
  getMemberKey,
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
import { allMemberName, parseColumnReference, serializeName, serializeTableAlias } from './utils'


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
    dimensionContext.cubeName = cube.schema.name
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
    .map((members: Array<string | { columnName: string; value: string; operator?: string }>) => {
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

/**
 * Compile member filters into SQL conditions
 * 
 * Supports multi-table scenarios where level columns can be:
 *   - A simple column name ("uuid") - uses level.table or dimension table
 *   - A table-prefixed column name ("cclts2.uuid") - uses specified table
 * 
 * @param members Array of members to filter
 * @param levels Hierarchy levels
 * @param dimensionContext Dimension context containing table and dialect info
 * @returns Array of compiled filter conditions
 */
export function compileMembers(members: IMember[], levels: PropertyLevel[], dimensionContext: DimensionContext) {
  // Determine the alias prefix:
  // - If hierarchy has its own tables, use hierarchy.name
  // - If it's a degenerate dimension (uses cube's tables), use cubeName
  const hasOwnTables = dimensionContext.hierarchy?.tables?.length > 0
  const aliasPrefix = hasOwnTables ? dimensionContext.hierarchy.name : (dimensionContext.cubeName || dimensionContext.hierarchy.name)
  
  return members.map((member) => {
    if (member.operator) {
      return levels.map((level) => {
        // Support multi-table: parse column reference
        const levelColumnRef = level.captionColumn || level.nameColumn || level.column
        const { table: parsedTable, column: levelColumn } = parseColumnReference(levelColumnRef)
        
        // Priority: level.table > parsed table prefix > dimension table
        const resolvedTable = level.table || parsedTable || dimensionContext.dimensionTable

        if (!levelColumn) {
          throw new Error(
            `Can't find table caption or name or key column for level '${level.name}' of dimension '${dimensionContext.dimension.dimension}'`
          )
        }

        const columnName = `${serializeName(
          resolvedTable ? serializeTableAlias(aliasPrefix, resolvedTable) : dimensionContext.factTable,
          dimensionContext.dialect
        )}.${serializeName(levelColumn, dimensionContext.dialect)}`

        let value = `%${member.caption}%`
        if (level.type !== 'Numeric' && level.type !== 'Integer') {
          value = `'${value}'`
        }

        return { columnName, value, operator: 'LIKE' }
      })
    }
    const memberKey = getMemberKey(member)
    return `${memberKey}`
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split('].[')
      .filter(
        (value, i) =>
          !(i === 0 && dimensionContext.hierarchy.hasAll && allMemberName(dimensionContext.hierarchy) === value)
      )
      .map((value, i) => {
        const level = levels[i]
        
        // Support multi-table: parse column reference
        const levelColumnRef = level.nameColumn || level.column
        const { table: parsedTable, column: levelColumn } = parseColumnReference(levelColumnRef)
        
        // Priority: level.table > parsed table prefix > dimension table
        const resolvedTable = level.table || parsedTable || dimensionContext.dimensionTable

        if (!levelColumn) {
          throw new Error(
            `Can't find table column for level '${level.name}' of dimension '${dimensionContext.dimension.dimension}'`
          )
        }

        const columnName = `${serializeName(
          resolvedTable ? serializeTableAlias(aliasPrefix, resolvedTable) : dimensionContext.factTable,
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

export function serializeEQMembers(members: Array<string | { columnName: string; value: string; operator?: string }>) {
  return And(...members.map((member) => (isString(member) ? member : `${member.columnName} ${member.operator ?? '='} ${member.value}`)))
}
