import {
  CalculatedProperty,
  CalculationProperty,
  compact,
  getEntityProperty,
  isAggregationProperty,
  isCalculatedProperty,
  isCalculationProperty,
  isIndicatorMeasureProperty,
  isRestrictedMeasureProperty,
  Property,
  PropertyMeasure,
  RestrictedMeasureProperty
} from '@metad/ocap-core'
import { CubeContext } from './cube'
import { Aggregate, And, Parentheses } from './functions'
import { compileSlicer } from './sql-filter'
import { parseColumnReference, serializeName, serializeTableAlias } from './utils'

export function serializeCalculationProperty(
  cubeContext: CubeContext,
  property: CalculationProperty,
  aggregate: boolean,
  dialect: string
) {
  let formula
  if (isAggregationProperty(property)) {
    formula = serializeAggregationProperty(property)
  } else if (isCalculatedProperty(property)) {
    return serializeCalculatedMeasure(cubeContext, property, aggregate, dialect)
  } else if (isRestrictedMeasureProperty(property) || isIndicatorMeasureProperty(property)) {
    return serializeRestrictedMeasure(cubeContext, property, aggregate, dialect)
  } else {
    throw new Error(`Unimplemented calculation type ${property.calculationType}`)
  }
  return formula
}

function serializeAggregationProperty(property: Property) {
  // console.log(property)
  return `TODO`
}

export function serializeRestrictedMeasure(
  cubeContext: CubeContext,
  indicator: RestrictedMeasureProperty,
  aggregate: boolean,
  dialect: string
) {
  const { factTable, schema } = cubeContext
  if (indicator.measure) {
    const measure = getEntityProperty<PropertyMeasure>(cubeContext.entityType, indicator.measure)
    if (!measure) {
      throw new Error(`Can't find measure for '${indicator.measure}'`)
    }

    const conditions = compact(
      indicator.slicers?.map((slicer) => compileSlicer(slicer, cubeContext, dialect))
      //  ??
      // indicator.dimensions?.map((dimension) => {
      //   return compileSlicer(convertDimensionToSlicer(dimension), cubeContext, dialect)
      // }) 
      ?? 
      []
    )

    let column = ''
    let statement = ''
    if (isCalculatedProperty(measure)) {
      column = serializeCalculatedMeasure(cubeContext, measure, aggregate && !indicator.aggregator, dialect)
      statement =
        aggregate && indicator.aggregator
          ? conditions?.length
            ? Aggregate(
                `CASE WHEN ${And(...Parentheses(...conditions))} THEN ${column} ELSE NULL END`,
                measure.aggregator
              )
            : Aggregate(column, measure.aggregator)
          : conditions?.length
          ? `CASE WHEN ${And(...Parentheses(...conditions))} THEN ${column} ELSE NULL END`
          : column
    } else {
      // Support multi-table: parse column reference to get table and column
      // If measure.column contains table prefix (e.g., "cclts2.amount"), use that table
      // Otherwise, use the fact table as default
      if (typeof measure.column === 'number') {
        column = measure.column
      } else {
        const { table: parsedTable, column: columnName } = parseColumnReference(measure.column as string)
        
        // Validate column name is not empty
        if (!columnName) {
          throw new Error(`Measure '${measure.name}' has no column configured. Please set the 'column' property.`)
        }
        
        // In multi-table mode, convert raw table name to the correct alias
        const isMultiTable = schema?.tables && schema.tables.length > 1
        let tableName: string
        
        if (parsedTable) {
          tableName = isMultiTable ? serializeTableAlias(schema.name, parsedTable) : parsedTable
        } else {
          tableName = factTable
        }
        
        column = serializeName(tableName, dialect) + '.' + serializeName(columnName, dialect)
      }

      statement = conditions?.length
        ? Aggregate(`CASE WHEN ${And(...Parentheses(...conditions))} THEN ${column} ELSE NULL END`, measure.aggregator)
        : Aggregate(column, measure.aggregator)
    }

    return statement
  }

  throw new Error(`未支持的方法`)
}

export function serializeCalculatedMeasure(
  cubeContext: CubeContext,
  measure: CalculatedProperty,
  aggregate: boolean,
  dialect: string
) {
  const regex = /\[[m|M][e|E][a|A][s|S][u|U][r|R][e|E][s|S]\]\.\[([\w\s\-_]*)\]/gm

  const measures = []
  let m
  while ((m = regex.exec(measure.formula)) !== null) {
    // This is necessary to avoid infinite loops with zero-width matches
    if (m.index === regex.lastIndex) {
      regex.lastIndex++
    }

    // The result can be accessed through the `m`-variable.
    measures.push({
      origin: m[0],
      measureName: m[1]
    })
  }

  const aggregator = measure.aggregator
  let formula = measure.formula
  measures.forEach(({ origin, measureName }) => {
    const property = getEntityProperty<PropertyMeasure>(cubeContext.entityType, measureName)
    formula = formula.replace(origin, serializeMeasure(cubeContext, property, aggregate && !aggregator, dialect))
  })

  return aggregate && aggregator ? Aggregate(formula, aggregator) : formula
}


/**
 * Serialize measure field (including various calculated measure fields) into execution statement
 * 
 * Supports multi-table scenarios where measure.column can be:
 *   - A number (constant value)
 *   - A simple column name ("amount") - uses fact table
 *   - A table-prefixed column name ("cclts2.amount") - uses specified table
 *   - measure.table property can also specify the source table
 *
 * @param cubeContext Cube context containing fact table info
 * @param measure Measure property configuration
 * @param aggregate Whether to apply aggregation
 * @param dialect SQL dialect
 * @returns Serialized measure expression
 */
export function serializeMeasure(
  cubeContext: CubeContext,
  measure: PropertyMeasure,
  aggregate: boolean,
  dialect: string
) {
  const { factTable, schema } = cubeContext
  if (isCalculationProperty(measure)) {
    return serializeCalculationProperty(cubeContext, measure, aggregate, dialect)
  }

  let measureExpression = ''
  if (measure.measureExpression?.sql?.content) {
    measureExpression = measure.measureExpression.sql.content
  } else if (typeof measure.column === 'number') {
    measureExpression = String(measure.column)
  } else {
    // Support multi-table: parse column reference to get table and column
    // If column contains table prefix (e.g., "cclts2.amount"), use that table
    // Otherwise, use the fact table as default
    const { table: parsedTable, column: columnName } = parseColumnReference(measure.column as string)
    
    // Validate column name is not empty
    if (!columnName) {
      throw new Error(`Measure '${measure.name}' has no column configured. Please set the 'column' property.`)
    }
    
    // In multi-table mode, table names in FROM clause use cube name as prefix (e.g., "[cube]_table")
    // So we need to convert the raw table name to the correct alias
    const isMultiTable = schema?.tables && schema.tables.length > 1
    let tableName: string
    
    if (parsedTable) {
      // Column has table prefix (e.g., "cclts2.amount")
      // Convert to table alias format used in FROM clause
      tableName = isMultiTable ? serializeTableAlias(schema.name, parsedTable) : parsedTable
    } else {
      // No table prefix, use fact table (which is already the correct alias in single table mode)
      tableName = factTable
    }
    
    measureExpression = serializeName(tableName, dialect) + '.' + serializeName(columnName, dialect)
  }

  return aggregate ? `${Aggregate(measureExpression, measure.aggregator)}` : measureExpression
}