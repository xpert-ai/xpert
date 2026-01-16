import {
  AggregationRole,
  countBy,
  Dimension,
  EntityType,
  flattenDeep,
  getEntityHierarchy,
  getEntityProperty,
  IMember,
  IntrinsicMemberProperties,
  ISlicer,
  isMeasure,
  OrderDirection,
  PropertyDimension,
  PropertyHierarchy,
  PropertyLevel,
  QueryOptions,
  RuntimeLevelType,
  Schema,
  Table
} from '@metad/ocap-core'
import {t} from 'i18next'
import { Cast } from './functions'
import { AggregateFunctions, C_MEASURES_ROW_COUNT, CubeFactTable } from './types'
import { allMemberCaption, allMemberName, isSQLDialect, serializeIntrinsicName, serializeName, serializeTableAlias, serializeUniqueName } from './utils'

export interface ColumnContext {
  table?: string
  column?: string
  alias?: string
}

export interface DimensionColumn extends ColumnContext {
  expression?: string
  cast?: 'VARCHAR'
  aggregate?: AggregateFunctions
}

export type DimensionField = DimensionColumn & {
  columns?: DimensionColumn[]
}

export interface OrderByColumn extends ColumnContext {
  direction?: OrderDirection
}

export interface LevelContext {
  /**
   * Queried level schema
   */
  level?: PropertyLevel
  selectFields: Array<DimensionField>
  orderBys: Array<OrderByColumn>
  groupBys: ColumnContext[]
}

/**
 * Build context for dimension
 */
export interface DimensionContext {
  /**
   * DB dialect
   */
  dialect: string
  /**
   * Fact table name in Cube
   * @deprecated use factTableAlias instead
   */
  factTable?: string
  /**
   * Fact table alias mapping in Cube
   */
  factTableAlias?: Record<string, string>
  /**
   * Dimension in request {@link Dimension}
   */
  dimension?: Dimension
  /**
   * Queried dimension Schema: {@link PropertyDimension }
   */
  schema?: PropertyDimension
  /**
   * Queried hierarchy schema
   */
  hierarchy?: PropertyHierarchy
  dimensionTable?: string

  /**
   * Alias for what?
   */
  alias?: string
  selectFields: Array<DimensionField>
  // parentKeyColumn?: string
  parentColumn?: string
  role: 'row' | 'column'
  levels?: Array<LevelContext>
  // Final output result fields
  columns?: string[]
  keyColumn?: string
  captionColumn?: string
  parentKeyColumn?: string
  ordinalColumn?: string
  childrenCardinalityColumn?: string
  members?: IMember[]
  orderBys?: OrderByColumn[]
  groupBys?: ColumnContext[]
  slicers?: ISlicer[]
}

export function serializeHierarchyFrom(
  factTable: string,
  hierarchy: PropertyHierarchy,
  dialect: string,
  catalog: string
) {
  if (hierarchy.tables?.length) {
    return serializeTablesJoin(hierarchy.name, hierarchy.tables, dialect, catalog)
  }

  return serializeName(
    hierarchy.primaryKeyTable ? serializeTableAlias(hierarchy.name, hierarchy.primaryKeyTable) : factTable,
    dialect
  )
}

export function serializeTablesJoin(prefix: string, tables: Table[], dialect: string, catalog: string) {
  const factTable = tables[0]
  const factTableAlias = serializeName(serializeTableAlias(prefix, factTable.name), dialect)
  let statement = serializeName(factTable.name, dialect, catalog) + ` AS ${factTableAlias}`
  const tableNames = [factTable.name]
  let leftTableAlias = factTableAlias
  tables.slice(1).forEach((table, i) => {
    const exists = tableNames.filter((name) => name === table.name)
    const tableAlias = serializeName(
      serializeTableAlias(prefix, exists.length ? `${table.name}(${exists.length})` : table.name),
      dialect
    )
    const conditions = table.join.fields
      .map(
        (field) =>
          `${leftTableAlias}.${serializeName(field.leftKey, dialect)} = ${tableAlias}.${serializeName(
            field.rightKey,
            dialect
          )}`
      )
      .join(' AND ')
    statement = `${statement} ${table.join.type} JOIN ${serializeName(
      table.name,
      dialect,
      catalog
    )} AS ${tableAlias} ON ${conditions}`
    leftTableAlias = tableAlias
    tableNames.push(table.name)
  })

  // ClickHouse does not support bracketing join statements for table associations
  // if (tables.length > 1) {
  //   statement = `(${statement})`
  // }

  return statement
}

export function getLevelColumn(level: PropertyLevel, table: string) {
  const dimensionField: DimensionField = {
    table,
    column: level.nameColumn || level.column,
  }

  // All need cast to string except `String` type in pg?
  if (level.type !== 'String') {
    dimensionField.cast = 'VARCHAR'
  }
  return dimensionField
}

export function unassignedMember(column: DimensionColumn, dialect: string) {
  const needCasts = ['pg']
  return `CASE WHEN ${serializeName(column.table, dialect)}.${serializeName(
    column.column,
    dialect
  )} IS NULL THEN '#' ELSE ${
    needCasts.includes(dialect) && column.cast ? 
      Cast(
      `${serializeName(column.table, dialect)}.${serializeName(column.column, dialect)}`,
      column.cast) : 
      `${serializeName(column.table, dialect)}.${serializeName(column.column, dialect)}`
  } END`
}

export function serializeColumnContext(column: ColumnContext, dialect: string) {
  return `${serializeName(column.table, dialect)}.${serializeName(column.column, dialect)}`
}

export function serializeColumn(field: DimensionField, dialect: string) {
  let statement = ''
  if (field.columns) {
    statement = field.columns.length
      ? concat(dialect, ...field.columns.map((col) => col.expression ?? unassignedMember(col, dialect)))
      : `''`
  } else {
    statement = `${
      field.expression ?? `${serializeName(field.table, dialect)}.${serializeName(field.column, dialect)}`
    }`
    if (field.cast) {
      statement = `CAST(${statement} AS ${field.cast})`
    }
  }

  if (field.aggregate) {
    switch (field.aggregate) {
      case AggregateFunctions.COUNT_DISTINCT:
        statement = `COUNT(DISTINCT ${statement})`
        break
      default:
    }
  }

  statement += ` AS ${serializeName(field.alias, dialect)}`

  return statement
}

export function concat(dialect: string, ...params) {
  const useOperator = ['sqlite', 'hana']

  if (useOperator.includes(dialect)) {
    return `'[' || ` + params.join(` || '].[' || `) + ` || ']'`
  }

  return `concat('[', ` + params.join(`,'].[',`) + `, ']')`
}

export function TableColumnMembers(dimension: Dimension, entityType: EntityType, dialect: string, catalog: string) {
  return `SELECT DISTINCT ${serializeName(dimension.dimension, dialect)} AS ${serializeName(
    'memberKey',
    dialect
  )} FROM ${serializeName(entityType.name, dialect, catalog)}`
}

export function DimensionTable(hierarchy: PropertyHierarchy) {
  return hierarchy.primaryKeyTable || hierarchy.tables?.[0]?.name
}

/**
 * serialize select statement for members of level
 * 
 * @param factTable table alias of fact table
 * @param hierarchy hierarchy of level
 * @param i level number
 * @param dialect DB dialect
 * @param catalog DB catalog
 * @returns select statement
 */
export function LevelMembers(
  factTable: string,
  hierarchy: PropertyHierarchy,
  i: number,
  dialect: string,
  catalog: string
) {
  const selectFields = []
  let orderBys
  if (hierarchy.hasAll && i === 0) {
    selectFields.push({
      expression: `'[${allMemberName(hierarchy)}]'`,
      alias: `memberKey`
    })
    selectFields.push({
      expression: `'${allMemberCaption(hierarchy)}'`,
      alias: `memberCaption`
    })
  } else {
    // top level to level number
    const levels = hierarchy.levels.slice(hierarchy.hasAll ? 1 : 0, i + 1)
    const dimensionTable = DimensionTable(hierarchy)
    selectFields.push({
      columns: levels.map((level) => {
        const table = level.table || dimensionTable
        return getLevelColumn(level, table ? serializeTableAlias(hierarchy.name, table) : factTable)
      }),
      alias: `memberKey`
    })

    const level = levels[levels.length - 1]
    const table = level.table || dimensionTable
    selectFields.push({
      ...LevelCaptionField(table ? serializeTableAlias(hierarchy.name, table) : factTable, level, dialect),
      alias: 'memberCaption'
    })

    if (levels.length > 1) {
      selectFields.push({
        columns: levels.slice(0, levels.length - 1).map((level) => {
          const table = level.table || dimensionTable
          return getLevelColumn(level, table ? serializeTableAlias(hierarchy.name, table) : factTable)
        }),
        alias: `parentKey`
      })
    } else if (hierarchy.hasAll) {
      selectFields.push({
        expression: `'[${allMemberName(hierarchy)}]'`,
        alias: `parentKey`
      })
    }

    // Ordinal Column
    orderBys = levels.map((level) => {
      const table = level.table || dimensionTable
      return {
        table: table ? serializeTableAlias(hierarchy.name, table) : factTable,
        column: level.ordinalColumn || level.column
      }
    })

  }

  let statement = `SELECT ${selectFields
    .map((item) => serializeColumn(item, dialect))
    .join(', ')} FROM ${serializeHierarchyFrom(factTable, hierarchy, dialect, catalog)}`

  statement +=
    ` GROUP BY ` +
    (serializeGroupByDimensions([{ dialect, hierarchy, selectFields: [...selectFields, ...(orderBys ?? [])], role: 'row', levels: [] }], dialect) || 1)

  if (orderBys) {
    statement += ' ORDER BY ' + orderBys.map(({table, column}) => `${serializeName(table, dialect)}.${serializeName(column, dialect)}`).join(',')
  }
  
  return statement
}

export function DimensionMembers(
  entity: string,
  dimension: Dimension,
  entityType: EntityType,
  schema: Schema,
  dialect: string,
  catalog?: string
) {
  // Entity is neither cube nor dimension, so it is table name
  if (
    !schema?.cubes?.find((item) => item.name === entity) &&
    !schema?.dimensions?.find((item) => item.name === entity)
  ) {
    return [TableColumnMembers(dimension, entityType, dialect, catalog)]
  }

  const hierarchy = getEntityHierarchy(entityType, dimension)
  if (!hierarchy) {
    throw new Error(`Can't find dimension '${dimension.dimension}' or hierarchy '${dimension.hierarchy}'`)
  }
  const cube = schema.cubes?.find((item) => item.name === entity)
  const factTable = cube ? CubeFactTable(cube) : null
  const levels = hierarchy.levels // .slice(hierarchy.hasAll ? 1 : 0)
  return levels.map((level, i) => {
    return LevelMembers(factTable, hierarchy, i, dialect, catalog)
  })
}

/**
 * Get the runtime SQL field configuration for level caption
 * 
 * @param table dimension table
 * @param level level property configuration
 * @param dialect database dialect
 * @returns 
 */
export function LevelCaptionField(table: string, level: PropertyLevel, dialect: string) {
  const captionColumn = level.captionColumn || level.nameColumn || level.column

  if (level.captionExpression?.sql?.content && isSQLDialect(level.captionExpression.sql, dialect)) {
    // Caption Expression
    return {
      table,
      column: captionColumn,
      expression: level.captionExpression.sql.content, // Need to check dialect
      // alias: serializeIntrinsicName(dialect, level.hierarchy, IntrinsicMemberProperties.MEMBER_CAPTION)
    }
  } else if (captionColumn) {
    // CaptionColumn
    return {
      table,
      column: captionColumn,
      // alias: serializeIntrinsicName(dialect, level.hierarchy, IntrinsicMemberProperties.MEMBER_CAPTION)
    }
  }

  throw new Error(`Can't find caption column for level '${level.name}'`)
}

/**
 * Build context for dimension query
 * 
 * @param context 
 * @param entityType 
 * @param row 
 * @param dialect 
 * @returns 
 */
export function buildDimensionContext(
  context: DimensionContext,
  entityType: EntityType,
  row: Dimension,
  dialect: string
): DimensionContext {
  const property = getEntityProperty(entityType, row)
  if (!property) {
    throw new Error(`Can't find dimension '${row.dimension}'`)
  }

  context.selectFields = context.selectFields ?? []
  context.schema = property
  context.dimension = row

  const _hierarchy = property.hierarchies?.find((item) =>
    row.hierarchy ? item.name === row.hierarchy : item.name === row.dimension
  )
  if (!_hierarchy) {
    throw new Error(`Can't find hierarchy '${row.hierarchy || row.dimension}'`)
  }
  if (context.hierarchy && context.hierarchy.name !== _hierarchy.name) {
    throw new Error(`Can't query different hierarchies at the same time`)
  }
  context.hierarchy = _hierarchy

  const lIndex = row.level ? context.hierarchy.levels?.findIndex((item) => item.name === row.level) : 0

  if (lIndex > -1) {
    const level = context.hierarchy.levels[lIndex]
    context.dimensionTable = context.hierarchy.primaryKeyTable || context.hierarchy.tables[0].name
    const table =
      serializeTableAlias(context.hierarchy.name, level.table || context.dimensionTable) || context.factTable
    // const nameColumn = level.nameColumn || level.column
    // let captionColumn = level.captionColumn || level.nameColumn
    // if (level.uniqueMembers) {
    //   context.selectFields.push({
    //     table,
    //     column: nameColumn,
    //     alias: level.name
    //   })
    // } else {
    //
    // captionColumn = captionColumn || nameColumn
    const levels = context.hierarchy.levels.slice(context.hierarchy.hasAll ? 1 : 0, lIndex + 1)
    const memberUniqueNameColumns = levels.map((level) => {
      const levelTable = level.table || context.dimensionTable
      return getLevelColumn(
        level,
        levelTable ? serializeTableAlias(context.hierarchy.name, levelTable) : context.factTable
      )
    })

    context.selectFields.push({
      table,
      columns: memberUniqueNameColumns,
      alias: level.name
    })
    // }

    context.selectFields.push({
      ...LevelCaptionField(table, level, dialect),
      alias: level.memberCaption
    })

    // This is a self-referential ParentChild
    if (level.parentColumn) {
      context.parentKeyColumn = level.column
      context.parentColumn = level.parentColumn
      const parentTable = table + '(1)'
      context.selectFields.push({
        table: parentTable,
        columns: memberUniqueNameColumns.map((column) => ({ ...column, table: parentTable })),
        alias: serializeIntrinsicName(dialect, level.name, 'PARENT_UNIQUE_NAME') // Keep consistent with MDX naming for now
      })
    }

    row.properties?.forEach((name) => {
      const property = level.properties?.find((item) => item.name === name)
      if (property) {
        context.selectFields.push({
          table,
          column: property.column,
          alias: property.name
        })
      }
    })

    // Ordinal Column
    context.orderBys.push({
      table,
      column: level.ordinalColumn || level.nameColumn || level.column
    })
  } else {
    throw new Error(`Can't find Level ${row.level}`)
  }

  return context
}

export function createDimensionContext(entityType: EntityType, dimension: Dimension) {
  const hierarchy = getEntityHierarchy(entityType, dimension)
  if (!hierarchy) {
    throw new Error(`Can't find hierarchy for '${dimension.hierarchy || dimension.dimension}'`)
  }
  const dimensionTable = DimensionTable(hierarchy)
  return {
    dimension: { dimension: dimension.dimension, hierarchy: dimension.hierarchy || dimension.dimension },
    schema: getEntityProperty(entityType, dimension),
    hierarchy,
    dimensionTable,
    selectFields: []
  } as DimensionContext
}

export function queryDimension(
  dimension: PropertyDimension,
  entityType: EntityType,
  options: QueryOptions,
  dialect?: string,
  catalog?: string
) {
  let context = { selectFields: [], orderBys: [] } as DimensionContext
  // const selectFields = []
  const measures = []

  // let hierarchy: PropertyHierarchy
  // let parentKeyColumn
  // let parentColumn
  ;[...(options.rows ?? []), ...(options.columns ?? [])].forEach((row) => {
    if (isMeasure(row)) {
      if (row.measure === C_MEASURES_ROW_COUNT) {
        measures.push({
          column: 1,
          aggregator: 'SUM',
          alias: C_MEASURES_ROW_COUNT
        })
      }
    } else {
      context = buildDimensionContext(context, entityType, row, dialect)
    }
  })

  let statement = context.selectFields.map((field) => serializeColumn(field, dialect)).join(', ')

  if (measures.length) {
    statement +=
      ', ' +
      measures
        .map(
          (measure) =>
            `${measure.aggregator}(${
              typeof measure.column === 'number'
                ? measure.column
                : serializeName(measure.table, dialect) + '.' + serializeName(measure.column, dialect)
            }) AS ${serializeName(measure.alias, dialect)}`
        )
        .join(', ')
  }

  statement +=
    ` FROM ` +
    (context.parentColumn
      ? serializeTablesJoin(
          context.hierarchy.name,
          [
            context.hierarchy.tables[0],
            {
              name: context.hierarchy.tables[0].name,
              join: {
                type: 'Left',
                fields: [
                  {
                    leftKey: context.parentColumn,
                    rightKey: context.parentKeyColumn
                  }
                ]
              }
            }
          ],
          dialect,
          catalog
        )
      : serializeHierarchyFrom('', context.hierarchy, dialect, catalog))

  if (measures.length) {
    statement += ` GROUP BY ` + serializeGroupByDimensions([context], dialect)
  }
  if (context.orderBys.length) {
    statement += ` ORDER BY ` + context.orderBys.map((field) => serializeColumnContext(field, dialect)).join(', ')
  }

  statement = `SELECT ` + statement

  if (options.paging?.top) {
    statement += ` LIMIT ${options.paging.top}`
  }

  return statement
}

/**
 * Serialize dimension contexts to group by sql statement
 * 
 * @param dimensions Dimension Contexts
 * @param dialect db dialect
 * @returns sql statement
 */
export function serializeGroupByDimensions(dimensions: DimensionContext[], dialect: string) {
  return [
    ...new Set(
      flattenDeep<DimensionColumn>(
        dimensions.map((context) =>
          [...(context.selectFields?.filter((field) => !field.aggregate)
            .map((field) => (field.columns ? field.columns : [field])) ?? []),
            ...(context.groupBys ?? [])
          ]
        )
      )
      .filter((field: ColumnContext) => !!field?.column)
      .map((field: ColumnContext) => `${serializeName(field.table, dialect)}.${serializeName(field.column, dialect)}`)
    )
  ].join(', ')
}

/**
 * Compile Dimension in Schema to Runtime EntityType property dimension
 *
 * @param entity Entity Name
 * @param dimension Dimension in Schema
 * @returns dimension property in EntityType
 */
export function compileDimensionSchema(
  entity: string,
  dimension: PropertyDimension,
  dialect?: string
): PropertyDimension {
  // Validators
  Object.entries(
    countBy(
      dimension.hierarchies?.map((hierarchy) => ({ name: hierarchy.name || '' })),
      'name'
    )
  ).forEach(([name, count]: [string, any]) => {
    if (count > 1) {
      throw new Error(t('Error.HierarchyNameDuplicated', {ns: 'sql', name, dimension: dimension.name, cube: entity}))
    }
  })

  const dimensionUniqueName = serializeUniqueName(dialect, dimension.name)

  const hierarchies = dimension.hierarchies?.map((hierarchy) => {
    // Validator: If has dimension table then must set primaryKey
    if (hierarchy.tables?.length && !hierarchy.primaryKey) {
      throw new Error(`The primaryKey '${hierarchy.primaryKey}' of hierarchy '${hierarchy.name ?? ''}' is not correct!`)
    }
    // Validator: If has multiple dimension tables
    if (hierarchy.tables?.length > 1) {
      // Tables joins check
      tablesValidator(hierarchy.tables)
      // must set primaryKeyTable
      if (!hierarchy.primaryKeyTable) {
        throw new Error(t('Error.NoPrimaryKeyTable', {ns: 'sql', hierarchy: hierarchy.name ?? ''}))
      }
    }

    const hierarchyUniqueName = serializeUniqueName(dialect, dimension.name, hierarchy.name)
    const levels = hierarchy.levels?.map((level) => ({
      ...level,
      caption: level.caption ?? level.name,
      name: serializeUniqueName(dialect, dimension.name, hierarchy.name, level.name),
      memberCaption: serializeUniqueName(
        dialect,
        dimension.name,
        hierarchy.name,
        level.name,
        IntrinsicMemberProperties.MEMBER_CAPTION
      ),
      role: AggregationRole.level,
      properties: level.properties?.filter((_) => !!_?.name).map((property) => ({
        ...property,
        name: serializeUniqueName(dialect, dimension.name, hierarchy.name, property.name),
        caption: property.caption || property.name,
      })) ?? []
    }))

    if (hierarchy.hasAll) {
      const allLevelName = hierarchy.allLevelName || `(All ${hierarchy.name || dimension.name}s)`
      const allLevelUniqueName = serializeUniqueName(dialect, dimension.name, hierarchy.name, allLevelName)
      levels?.splice(0, 0, {
        name: allLevelUniqueName,
        caption: allLevelName,
        role: AggregationRole.level,
        memberCaption: serializeIntrinsicName(dialect, allLevelUniqueName, IntrinsicMemberProperties.MEMBER_CAPTION),
        properties: [],
        levelType: RuntimeLevelType.ALL
      })
    }

    return {
      ...hierarchy,
      name: hierarchyUniqueName,
      caption: hierarchy.caption || dimension.caption,
      entity,
      dimension: dimensionUniqueName,
      role: AggregationRole.hierarchy,
      memberCaption: serializeUniqueName(dialect, dimension.name, hierarchy.name, IntrinsicMemberProperties.MEMBER_CAPTION),
      allMember: hierarchy.hasAll ? `[${allMemberName(hierarchy)}]` : null,
      levels: levels?.map((level, i) => ({
        ...level,
        levelNumber: i,
        entity,
        dimension: dimensionUniqueName,
        hierarchy: hierarchyUniqueName
      })) ?? []
    }
  })

  return {
    ...dimension,
    entity,
    name: dimensionUniqueName,
    memberCaption: serializeIntrinsicName(dialect, dimensionUniqueName, IntrinsicMemberProperties.MEMBER_CAPTION),
    hierarchies,
    role: AggregationRole.dimension
  }
}

export function tablesValidator(tables: Table[]) {
  const needJoinTables = tables.slice(1).filter((table) => !table.join?.fields?.length)
  if (needJoinTables.length) {
    throw new Error(t('Error.TablesNoJoin', {ns: 'sql', tables: needJoinTables.map(({name}) => name).join(', ')}))
  }
}
