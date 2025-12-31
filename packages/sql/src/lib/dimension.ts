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
import { allMemberCaption, allMemberName, cleanSqlDelimiters, isSQLDialect, parseColumnReference, serializeIntrinsicName, serializeName, serializeTableAlias, serializeUniqueName } from './utils'

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
   * Cube name - used as table alias prefix for degenerate dimensions
   * When dimension uses cube's fact/join tables directly (no own dimension tables),
   * table aliases should use cubeName instead of hierarchy.name
   */
  cubeName?: string
  /**
   * Fact table name in Cube
   */
  factTable?: string
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
  // Validate prefix to prevent invalid table aliases like "[]_tablename"
  if (!prefix || !prefix.trim()) {
    throw new Error('Table alias prefix (cube/hierarchy name) cannot be empty for multi-table joins')
  }
  
  // Validate tables array
  if (!tables || tables.length === 0) {
    throw new Error('Tables array cannot be empty for multi-table joins')
  }
  
  const factTable = tables[0]
  if (!factTable.name || !factTable.name.trim()) {
    throw new Error('Fact table name cannot be empty')
  }
  
  const factTableAlias = serializeName(serializeTableAlias(prefix, factTable.name), dialect)
  let statement = serializeName(factTable.name, dialect, catalog) + ` AS ${factTableAlias}`
  const tableNames = [factTable.name]
  let leftTableAlias = factTableAlias
  tables.slice(1).forEach((table, i) => {
    // Validate join table
    if (!table.name || !table.name.trim()) {
      throw new Error(`Join table at index ${i + 1} has no name configured`)
    }
    
    const exists = tableNames.filter((name) => name === table.name)
    const tableAlias = serializeName(
      serializeTableAlias(prefix, exists.length ? `${table.name}(${exists.length})` : table.name),
      dialect
    )
    
    // Validate join configuration
    if (!table.join || !table.join.fields || table.join.fields.length === 0) {
      throw new Error(`Table '${table.name}' has no join configuration. Please configure the join fields.`)
    }
    
    // Validate join fields and build conditions
    const validFields = table.join.fields.filter(field => {
      const hasLeftKey = field.leftKey && field.leftKey.trim()
      const hasRightKey = field.rightKey && field.rightKey.trim()
      return hasLeftKey && hasRightKey
    })
    
    if (validFields.length === 0) {
      throw new Error(`Table '${table.name}' has no valid join fields configured. Each join field must have both leftKey and rightKey.`)
    }
    
    const conditions = validFields
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

/**
 * Get level column configuration for dimension field
 * 
 * Supports multi-table scenarios where level.column can be:
 *   - A simple column name ("uuid") - uses provided table
 *   - A table-prefixed column name ("cclts2.uuid") - uses specified table with alias
 *   - level.table property can also specify the source table
 * 
 * @param level Level property configuration
 * @param table Default table alias to use if column has no table prefix
 * @param aliasPrefix Optional prefix for generating table alias when column has table prefix
 *                    (e.g., hierarchy name or cube name)
 * @returns DimensionField with resolved table and column
 */
export function getLevelColumn(level: PropertyLevel, table: string, aliasPrefix?: string) {
  // Get column name, prefer nameColumn over column
  let columnRef = level.nameColumn || level.column
  
  // If no column is explicitly set, try to extract from level name
  // level.name might be a serialized unique name like "[uuid].[uuid]" or a simple name like "[uuid]"
  if (!columnRef && level.name) {
    // Extract the last part of the unique name as column (e.g., "[dim].[level]" -> "level")
    const nameParts = level.name.split('].[')
    const lastPart = nameParts[nameParts.length - 1]
    // Clean the extracted name
    columnRef = cleanSqlDelimiters(lastPart)
  }
  
  // Also try caption as fallback
  if (!columnRef && level.caption) {
    columnRef = cleanSqlDelimiters(level.caption)
  }
  
  // Parse column reference to support multi-table format (e.g., "cclts2.uuid")
  const { table: parsedTable, column } = parseColumnReference(columnRef)
  
  // Validate column is not empty
  if (!column) {
    throw new Error(`Level '${level.name || level.caption}' has no column configured. Please set the 'column' property.`)
  }
  
  // Priority: level.table > table prefix in column > provided table
  let resolvedTable: string
  if (level.table) {
    // level.table is explicitly set, use it with alias prefix if provided
    resolvedTable = aliasPrefix ? serializeTableAlias(aliasPrefix, level.table) : level.table
  } else if (parsedTable) {
    // Column has table prefix (e.g., "cclts2.uuid"), convert to alias format
    resolvedTable = aliasPrefix ? serializeTableAlias(aliasPrefix, parsedTable) : parsedTable
  } else {
    // Use default table (already formatted as alias)
    resolvedTable = table
  }
  
  const dimensionField: DimensionField = {
    table: resolvedTable,
    column,
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
        return getLevelColumn(level, table ? serializeTableAlias(hierarchy.name, table) : factTable, hierarchy.name)
      }),
      alias: `memberKey`
    })

    const level = levels[levels.length - 1]
    const table = level.table || dimensionTable
    selectFields.push({
      ...LevelCaptionField(table ? serializeTableAlias(hierarchy.name, table) : factTable, level, dialect, hierarchy.name),
      alias: 'memberCaption'
    })

    if (levels.length > 1) {
      selectFields.push({
        columns: levels.slice(0, levels.length - 1).map((level) => {
          const table = level.table || dimensionTable
          return getLevelColumn(level, table ? serializeTableAlias(hierarchy.name, table) : factTable, hierarchy.name)
        }),
        alias: `parentKey`
      })
    } else if (hierarchy.hasAll) {
      selectFields.push({
        expression: `'[${allMemberName(hierarchy)}]'`,
        alias: `parentKey`
      })
    }

    // Ordinal Column - support multi-table format
    orderBys = levels.map((level) => {
      const ordinalColumnRef = level.ordinalColumn || level.column
      const { table: parsedTable, column: ordinalColumn } = parseColumnReference(ordinalColumnRef)
      const table = level.table || parsedTable || dimensionTable
      return {
        table: table ? serializeTableAlias(hierarchy.name, table) : factTable,
        column: ordinalColumn
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
 * Supports multi-table scenarios where caption column can be:
 *   - A simple column name ("name") - uses provided table
 *   - A table-prefixed column name ("cclts2.name") - uses specified table with alias
 * 
 * @param table Default dimension table alias
 * @param level Level property configuration
 * @param dialect Database dialect
 * @param aliasPrefix Optional prefix for generating table alias when column has table prefix
 * @returns Column field configuration
 */
export function LevelCaptionField(table: string, level: PropertyLevel, dialect: string, aliasPrefix?: string) {
  // Clean and resolve column reference
  // Priority: captionColumn > nameColumn > column > extracted from level.name
  let captionColumnRef = level.captionColumn || level.nameColumn || level.column
  
  // If no column is explicitly set, try to extract from level name
  // level.name might be a serialized unique name like "[uuid].[uuid]" or a simple name like "[uuid]"
  if (!captionColumnRef && level.name) {
    // Extract the last part of the unique name as column (e.g., "[dim].[level]" -> "level")
    const nameParts = level.name.split('].[')
    const lastPart = nameParts[nameParts.length - 1]
    // Clean the extracted name
    captionColumnRef = cleanSqlDelimiters(lastPart)
  }
  
  // Also try caption as fallback
  if (!captionColumnRef && level.caption) {
    captionColumnRef = cleanSqlDelimiters(level.caption)
  }

  // Helper function to resolve table with alias
  const resolveTable = (parsedTable: string | null): string => {
    if (level.table) {
      return aliasPrefix ? serializeTableAlias(aliasPrefix, level.table) : level.table
    } else if (parsedTable) {
      return aliasPrefix ? serializeTableAlias(aliasPrefix, parsedTable) : parsedTable
    }
    return table
  }

  if (level.captionExpression?.sql?.content && isSQLDialect(level.captionExpression.sql, dialect)) {
    // Caption Expression - parse column reference for multi-table support
    const { table: parsedTable, column: captionColumn } = parseColumnReference(captionColumnRef)
    if (!captionColumn) {
      const originalName = level.caption || level.name?.replace(/^\[|\]$/g, '').split('].[').pop() || level.name
      throw new Error(`Level '${originalName}' has empty column in captionExpression context. Please configure a valid column.`)
    }
    return {
      table: resolveTable(parsedTable),
      column: captionColumn,
      expression: level.captionExpression.sql.content, // Need to check dialect
      // alias: serializeIntrinsicName(dialect, level.hierarchy, IntrinsicMemberProperties.MEMBER_CAPTION)
    }
  } else if (captionColumnRef) {
    // CaptionColumn - parse column reference for multi-table support
    const { table: parsedTable, column: captionColumn } = parseColumnReference(captionColumnRef)
    if (!captionColumn) {
      const originalName = level.caption || level.name?.replace(/^\[|\]$/g, '').split('].[').pop() || level.name
      throw new Error(`Level '${originalName}' has empty column. Please configure a valid column.`)
    }
    return {
      table: resolveTable(parsedTable),
      column: captionColumn,
      // alias: serializeIntrinsicName(dialect, level.hierarchy, IntrinsicMemberProperties.MEMBER_CAPTION)
    }
  }

  // Extract original level name for better error message
  // level.name might be serialized unique name like "[uuid].[uuid]"
  // Try to get original name from caption or parse from unique name
  const originalName = level.caption || level.name?.replace(/^\[|\]$/g, '').split('].[').pop() || level.name
  throw new Error(`Can't find caption column for level '${originalName}' (column=${level.column}, nameColumn=${level.nameColumn}, captionColumn=${level.captionColumn}). Please configure the 'column' property for this level.`)
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
  context.orderBys = context.orderBys ?? []
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
        levelTable ? serializeTableAlias(context.hierarchy.name, levelTable) : context.factTable,
        context.hierarchy.name
      )
    })

    context.selectFields.push({
      table,
      columns: memberUniqueNameColumns,
      alias: level.name
    })
    // }

    context.selectFields.push({
      ...LevelCaptionField(table, level, dialect, context.hierarchy.name),
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
        // Support multi-table: parse property column reference
        const { table: propTable, column: propColumn } = parseColumnReference(property.column)
        // Convert raw table name to alias format
        let resolvedPropTable: string
        if (propTable) {
          resolvedPropTable = serializeTableAlias(context.hierarchy.name, propTable)
        } else {
          resolvedPropTable = table
        }
        context.selectFields.push({
          table: resolvedPropTable,
          column: propColumn,
          alias: property.name
        })
      }
    })

    // Ordinal Column - support multi-table format
    const ordinalColumnRef = level.ordinalColumn || level.nameColumn || level.column
    const { table: ordinalTable, column: ordinalColumn } = parseColumnReference(ordinalColumnRef)
    // Convert raw table name to alias format
    let resolvedOrdinalTable: string
    if (level.table) {
      resolvedOrdinalTable = serializeTableAlias(context.hierarchy.name, level.table)
    } else if (ordinalTable) {
      resolvedOrdinalTable = serializeTableAlias(context.hierarchy.name, ordinalTable)
    } else {
      resolvedOrdinalTable = table
    }
    context.orderBys.push({
      table: resolvedOrdinalTable,
      column: ordinalColumn
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
  // Clean dimension name to remove SQL delimiters like brackets
  const cleanedDimensionName = cleanSqlDelimiters(dimension.name)
  
  // Validators
  Object.entries(
    countBy(
      dimension.hierarchies?.map((hierarchy) => ({ name: hierarchy.name || '' })),
      'name'
    )
  ).forEach(([name, count]: [string, any]) => {
    if (count > 1) {
      throw new Error(t('Error.HierarchyNameDuplicated', {ns: 'sql', name, dimension: cleanedDimensionName, cube: entity}))
    }
  })

  const dimensionUniqueName = serializeUniqueName(dialect, cleanedDimensionName)

  const hierarchies = dimension.hierarchies?.map((hierarchy) => {
    // Validator: If has dimension table then must set primaryKey
    // Check if primaryKey is a valid non-empty string (not null, undefined, empty string, or string 'null')
    const hasValidPrimaryKey = hierarchy.primaryKey && 
                                typeof hierarchy.primaryKey === 'string' && 
                                hierarchy.primaryKey.trim() !== '' && 
                                hierarchy.primaryKey.toLowerCase() !== 'null'
    if (hierarchy.tables?.length && !hasValidPrimaryKey) {
      throw new Error(`The primaryKey '${hierarchy.primaryKey ?? 'null'}' of hierarchy '${hierarchy.name ?? ''}' is not correct! Please set a valid primary key when dimension tables are defined.`)
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

    const hierarchyUniqueName = serializeUniqueName(dialect, cleanedDimensionName, hierarchy.name)
    const levels = hierarchy.levels?.map((level) => ({
      ...level,
      caption: level.caption ?? level.name,
      name: serializeUniqueName(dialect, cleanedDimensionName, hierarchy.name, level.name),
      memberCaption: serializeUniqueName(
        dialect,
        cleanedDimensionName,
        hierarchy.name,
        level.name,
        IntrinsicMemberProperties.MEMBER_CAPTION
      ),
      role: AggregationRole.level,
      properties: level.properties?.filter((_) => !!_?.name).map((property) => ({
        ...property,
        name: serializeUniqueName(dialect, cleanedDimensionName, hierarchy.name, property.name),
        caption: property.caption || property.name,
      })) ?? []
    }))

    if (hierarchy.hasAll) {
      const allLevelName = hierarchy.allLevelName || `(All ${hierarchy.name || cleanedDimensionName}s)`
      const allLevelUniqueName = serializeUniqueName(dialect, cleanedDimensionName, hierarchy.name, allLevelName)
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
      memberCaption: serializeUniqueName(dialect, cleanedDimensionName, hierarchy.name, IntrinsicMemberProperties.MEMBER_CAPTION),
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
