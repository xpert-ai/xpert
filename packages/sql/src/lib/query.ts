import {
  AdvancedSlicer,
  Cube,
  C_MEASURES,
  EntityType,
  IntrinsicMemberProperties,
  isAdvancedSlicer,
  isArray,
  isMeasure,
  OrderDirection,
  PivotColumn,
  PropertyMeasure,
  QueryOptions,
  RecursiveHierarchyType,
  wrapHierarchyValue
} from '@metad/ocap-core'
import { buildCubeContext, CubeContext } from './cube'
import {
  DimensionContext,
  serializeColumn,
  serializeColumnContext,
  serializeGroupByDimensions,
  serializeHierarchyFrom,
  serializeTablesJoin
} from './dimension'
import { And, Parentheses } from './functions'
import { compileFilters } from './sql-filter'
import { SQLQueryContext, SQLQueryProperty } from './types'
import { serializeName, serializeTableAlias } from './utils'
import { serializeMeasure } from './calculation'

export function getFirstElement<T>(objOrArray: T | T[]): T {
  return isArray(objOrArray) ? objOrArray[0] : objOrArray
}

export function serializeFrom(cube: Cube, entityType: EntityType, dialect: string) {
  const expression = cube.expression || serializeCubeFact(cube, dialect)
  return `(${expression}) AS ${serializeName(entityType.name, dialect)}`
}

export function serializeCubeFact(cube: Cube, dialect: string) {
  let factTable = cube.tables[0]
  if (cube.fact?.type === 'table') {
    factTable = cube.fact.table
  }

  // Get fact table name for filtering
  const factTableName = factTable?.name || (factTable as any)
  
  if (!factTableName) {
    throw new Error('Fact table name is required for SQL generation')
  }

  let statement = serializeName(factTableName, dialect)
  const tableNames = [factTableName]
  
  // Filter out fact table from join tables to prevent duplication
  // Only process tables that are different from the fact table
  const joinTables = (cube.tables || []).slice(1).filter(
    (table) => table.name && table.name.trim() && table.name !== factTableName
  )
  
  // Track the left table alias for join conditions
  // Start with fact table alias
  let leftTableAlias = serializeName(factTableName, dialect)
  
  joinTables.forEach((table) => {
    // Check if table name already exists (for duplicate table names)
    const exists = tableNames.filter((name) => name === table.name)
    const tableAlias = exists.length ? `${table.name}(${exists.length})` : table.name
    
    // Validate join configuration
    if (!table.join || !table.join.type || !table.join.fields || table.join.fields.length === 0) {
      console.warn(`Join configuration is missing or invalid for table ${table.name}`)
      return // Skip this table
    }
    
    // Build join conditions
    // Filter out invalid fields first
    const validFields = table.join.fields.filter(
      (field) => field && field.leftKey && field.leftKey.trim() && field.rightKey && field.rightKey.trim()
    )
    
    if (validFields.length === 0) {
      console.warn(`No valid join fields found for table ${table.name}`)
      return // Skip this table if no valid fields
    }
    
    // Use leftTableAlias instead of factTableName for chained joins
    const conditionStatements = validFields.map((field) => {
      // Use leftTableAlias for leftKey (previous table in join chain)
      const leftKeyTable = leftTableAlias
      // Use current table alias for rightKey
      const rightKeyTable = serializeName(tableAlias, dialect)
      
      return `${leftKeyTable}.${serializeName(field.leftKey.trim(), dialect)} = ${rightKeyTable}.${serializeName(field.rightKey.trim(), dialect)}`
    })
    
    // Build conditions using And and Parentheses
    const conditions = And(...Parentheses(...conditionStatements))
    
    // Only add join if conditions are valid and not empty
    if (conditions && conditions.trim() && table.join.type) {
      statement = `${statement} ${table.join.type} JOIN ${serializeName(table.name, dialect)} AS ${serializeName(
        tableAlias,
        dialect
      )} ON ${conditions}`
      
      // Update leftTableAlias for next join
      leftTableAlias = serializeName(tableAlias, dialect)
      tableNames.push(table.name)
    } else {
      console.warn(`Invalid join conditions for table ${table.name}, skipping join`)
    }
  })

  return `SELECT * FROM ${statement}`
}

/**
 *
 * @param schema
 * @param options
 * @param entityType
 * @param catalog Data source catalog, corresponding to schemaName in Hive
 * @param dialect
 * @returns
 */
export function queryCube(cube: Cube,
  options: QueryOptions,
  entityType: EntityType,
  dialect: string,
  catalog?: string
) {
  const cubeContext: CubeContext = buildCubeContext(cube, options, entityType, dialect)
  // Compile Slicers
  const conditions = []
  cubeContext.filterString = options.filterString || ''
  const filters = []
  options.filters?.forEach((item) => {
    if (isAdvancedSlicer(item)) {
      conditions.push(item)
    } else {
      filters.push(item)
    }
  })
  cubeContext.dimensions.forEach((dimension) => {
    if (dimension.slicers?.length) {
      filters.push(...dimension.slicers)
    }
  })
  if (filters.length) {
    cubeContext.filterString +=
      (cubeContext.filterString ? ` AND ` : '') + compileFilters(filters, cubeContext, dialect)
  }

  // Combine and arrange the levels to be calculated under each Dimension
  let levels: CubeContext[] = []
  cubeContext.dimensions
    .filter(({ dimension }) => dimension.dimension !== C_MEASURES)
    .forEach((dimensionContext) => {
      const _levels = levels.length ? [...levels] : [{ ...cubeContext, dimensions: [] }]
      levels = []

      if (dimensionContext.levels?.length) {
        dimensionContext.levels?.forEach((level) => {
          levels.push(
            ..._levels.map((context) => {
              return {
                ...context,
                dimensions: [
                  ...context.dimensions,
                  {
                    ...dimensionContext,
                    level: level.level,
                    selectFields: level.selectFields,
                    orderBys: level.orderBys,
                    groupBys: level.groupBys
                  }
                ] as DimensionContext[]
              } as CubeContext
            })
          )
        })
      } else {
        levels.push(
          ..._levels.map((context) => ({
            ...context,
            dimensions: [
              ...context.dimensions,
              {
                ...dimensionContext
              }
            ]
          }))
        )
      }
    })

  const levelStatements = levels.map((cubeContext) => serializeLevelSelect(cubeContext, dialect, catalog))
  let statement =
    levelStatements.length > 1
      ? levelStatements.map((statement) => `(${statement})`).join(' union ')
      : levelStatements.length === 1
      ? levelStatements[0]
      : serializeLevelSelect(cubeContext, dialect, catalog)

  if (options.paging?.top || options.orderbys?.length) {
    statement = `SELECT * FROM (${statement}) AS LIMIT_ALIAS`
    if (options.orderbys?.length) {
      statement =
        `${statement} ORDER BY ` +
        options.orderbys
          .map((orderBy) => serializeName(orderBy.by, dialect) + ' ' + (orderBy.order || 'ASC'))
          .join(', ')
    }
    if (options.paging?.top) {
      statement = `${statement} LIMIT ${options.paging.top}`
    }
  }

  return { cubeContext, statement }
}

/**
 * Serialize single level combination to generate statement
 *
 * @param cubeContext
 * @param dialect
 * @param catalog
 * @returns
 */
export function serializeLevelSelect(cubeContext: CubeContext, dialect: string, catalog: string) {
  // const cube = cubeContext.schema
  const dimensionsStatement = cubeContext.dimensions
    .map((dimensionContext) => {
      return dimensionContext.selectFields?.map((field) => serializeColumn(field, dialect)).join(', ')
    })
    .filter((statement) => !!statement)
    .join(', ')

  let statement: string
  if (cubeContext.measures.length) {
    // fact table in cube
    // const fact = serializeTableAlias(cube.name, cube.tables[0].name) // use factTable in CubeContext

    statement =
      dimensionsStatement +
      (dimensionsStatement ? ', ' : '') +
      cubeContext.measures
        .map(
          (measure: { alias: string; order?: OrderDirection } & PropertyMeasure) =>
            `${serializeMeasure(cubeContext, measure, true, dialect)} AS ${serializeName(measure.alias, dialect)}`
        )
        .join(', ')
  }

  // Compile cube and dimensions
  statement += ` FROM ` + serializeCubeFrom(cubeContext, dialect, catalog)
  // Where slicers
  if (cubeContext.filterString) {
    statement += ' WHERE ' + cubeContext.filterString
  }

  // Aggregate Dimensions
  const groupByStatement = serializeGroupByDimensions(cubeContext.dimensions, dialect) || (dimensionsStatement ? 1 : '')
  if (groupByStatement) {
    statement += ` GROUP BY ` + groupByStatement
  }

  // Order by measures
  let orderBy = ''
  const measureOrders = cubeContext.measures
    .filter(({ order }) => order)
    .map((measure) => serializeName(measure.alias, dialect) + ' ' + measure.order)
  if (measureOrders.length) {
    orderBy = measureOrders.join(', ')
  }
  orderBy = cubeContext.dimensions.reduce((orderBy, { orderBys }) => {
    const _orderByCols = orderBys?.map((col) => serializeColumnContext(col, dialect))
    if (_orderByCols?.length) {
      if (orderBy) {
        _orderByCols.splice(0, 0, orderBy)
      }
      return _orderByCols.join(', ')
    }
    return orderBy
  }, orderBy)

  if (orderBy) {
    statement += ' ORDER BY ' + orderBy
  }

  return `SELECT ` + statement
}

/**
 * Serialize FROM clause for cube query
 * 
 * Supports multi-table scenarios:
 *   - If cube has multiple tables (cube.tables), use all tables with joins
 *   - If cube has single fact table, use that table
 *   - Dimensions are joined based on foreign key relationships
 * 
 * @param cubeContext Cube context containing schema and dimension info
 * @param dialect SQL dialect
 * @param catalog Optional catalog name
 * @returns FROM clause string
 */
export function serializeCubeFrom(cubeContext: CubeContext, dialect: string, catalog?: string): string {
  const cube = cubeContext.schema
  
  // Determine tables to use - prioritize cube.tables for multi-table mode
  let baseTables: any[] = []
  
  if (cube.tables && cube.tables.length > 0) {
    // Multi-table mode: use all configured tables
    baseTables = cube.tables
  } else if (cube.fact?.table) {
    // Single table mode: use fact table
    baseTables = [cube.fact.table]
  } else {
    throw new Error(`Cube '${cube.name}' does not have a fact table configured.`)
  }
  
  // Build FROM clause with multi-table joins
  return (
    serializeTablesJoin(cube.name, baseTables, dialect, catalog) +
    cubeContext.dimensions
      .filter((dimensionContext) => !!dimensionContext.dimensionTable)
      .map((dimensionContext) => {
        const primaryKeyTable = dimensionContext.hierarchy.primaryKeyTable || dimensionContext.hierarchy.tables[0].name
        if (!primaryKeyTable) {
          throw new Error(`Can't find primary key table for hierarchy '${dimensionContext.hierarchy.name}'`)
        }

        if (!dimensionContext.hierarchy.primaryKey) {
          throw new Error(`Can't find primary key column for hierarchy '${dimensionContext.hierarchy.name}'`)
        }
        return (
          ` INNER JOIN ` +
          serializeHierarchyFrom('', dimensionContext.hierarchy, dialect, catalog) +
          ` ON ${serializeName(cubeContext.factTable, dialect)}.${serializeName(
            dimensionContext.schema.foreignKey,
            dialect
          )} = ${serializeName(
            serializeTableAlias(dimensionContext.hierarchy.name, primaryKeyTable),
            dialect
          )}.${serializeName(dimensionContext.hierarchy.primaryKey, dialect)}`
        )
      })
      .join('')
  )
}

export function serializeCondition(condition: AdvancedSlicer, context: Array<SQLQueryProperty>) {
  return ``
}

export function serializeTopCount(options) {
  return `LIMIT ${options.paging.top}`
}

export function serializeOrderbys(orderbys, { rows, columns }: SQLQueryContext, dialect: string) {
  const fields = [].concat(rows ?? []).concat(columns ?? [])
  return orderbys
    .filter(({ by }) => fields.find((item) => item.property.name === by))
    .map(({ by, order }) => `${serializeName(by, dialect)}${order ? ` ${order}` : ''}`)
}

export function isZeroSuppression(context: SQLQueryContext) {
  let zeroSuppression = false
  context.rows.forEach(({ dimension }) => {
    if (!isMeasure(dimension)) {
      if (dimension.zeroSuppression) {
        zeroSuppression = true
      }
    }
  })
  context.columns.forEach(({ dimension }) => {
    if (!isMeasure(dimension)) {
      if (dimension.zeroSuppression) {
        zeroSuppression = true
      }
    }
  })
  return zeroSuppression
}

/**
 * Currently only supports Measures at the end.
 *
 * @param cubeContext
 * @param data
 * @returns
 */
export function transposePivot(cubeContext: CubeContext, data: Array<any>) {
  const rowContexts = cubeContext.dimensions.filter((context) => context.role === 'row')
  const columnContexts = cubeContext.dimensions.filter((context) => context.role === 'column')
  let recursiveHierarchy: RecursiveHierarchyType
  let rowHierarchy: string
  const hRow = rowContexts?.find((row) => row.dimension.displayHierarchy)
  if (hRow) {
    rowHierarchy = hRow.hierarchy.name
    recursiveHierarchy = {
      parentNodeProperty: wrapHierarchyValue(hRow.keyColumn, IntrinsicMemberProperties.PARENT_UNIQUE_NAME),
      valueProperty: hRow.keyColumn,
      labelProperty: hRow.captionColumn
    }
  }

  if (!columnContexts.length) {
    return { data, schema: { recursiveHierarchy, rowHierarchy } }
  }

  const columns: PivotColumn[] = []
  const columnsKeyMap = {}

  const results = []
  const resultKeyMap = {}
  data.forEach((item) => {
    // Backward compatibility for dimension name property
    rowContexts.forEach(({ schema, dimension, keyColumn, captionColumn, members }) => {
      if (dimension.dimension === C_MEASURES) {
        item[schema.name] = members[0].label
      } else {
        item[dimension.dimension] = item[keyColumn]
        item[schema.memberCaption] = item[captionColumn]
      }
    })
    const rowKey = rowContexts.map(({ keyColumn }) => item[keyColumn]).join('')
    if (!resultKeyMap[rowKey]) {
      resultKeyMap[rowKey] = { ...item }
      results.push(resultKeyMap[rowKey])
    }

    let parent = null
    let parentColumns = columns
    columnContexts.forEach(
      ({ keyColumn, captionColumn, parentKeyColumn, childrenCardinalityColumn, dimension, members }, key, arr) => {
        if (isMeasure(dimension)) {
          members.forEach((member) => {
            const keyColumn = member.value
            const columnName = (parent?.name ? parent.name + '/' : '') + keyColumn
            if (!columnsKeyMap[columnName]) {
              columnsKeyMap[columnName] = {
                name: columnName,
                caption: member.caption || member.value,
                uniqueName: keyColumn,
                measure: keyColumn,
                member: {
                  key: keyColumn,
                  caption: member.caption || member.value,
                  value: member.value
                },
                columns: []
              }

              parentColumns.push(columnsKeyMap[columnName])
            }

            if (Object.is(arr.length - 1, key)) {
              const measure = columnsKeyMap[columnName].measure ?? cubeContext.schema.defaultMeasure
              resultKeyMap[rowKey][columnName] = item[measure]
            }
          })
        } else {
          const columnName = (parent?.name ? parent.name + '/' : '') + item[keyColumn]
          if (!columnsKeyMap[columnName]) {
            columnsKeyMap[columnName] = {
              name: columnName,
              caption: item[captionColumn],
              uniqueName: item[keyColumn],
              parentUniqueName: item[parentKeyColumn],
              childrenCardinality: item[childrenCardinalityColumn],
              // measure: parent?.measure,
              member: {
                key: item[keyColumn],
                caption: item[captionColumn],
                value: item[keyColumn],
              },
              columns: []
            }

            parentColumns.push(columnsKeyMap[columnName])
          }

          if (Object.is(arr.length - 1, key)) {
            const measure = columnsKeyMap[columnName].measure ?? cubeContext.schema.defaultMeasure
            resultKeyMap[rowKey][columnName] = item[measure]
          }

          parent = columnsKeyMap[columnName]
          parentColumns = columnsKeyMap[columnName].columns
        }
      }
    )
  })

  return {
    data: results,
    schema: {
      recursiveHierarchy,
      rowHierarchy,
      columns,
      columnAxes: columnContexts.map(({ dimension, members }) => ({
        ...dimension,
        members
      }))
    }
  }
}
