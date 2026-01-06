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
import { serializeName } from './utils'

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
  const { factTable } = cubeContext
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
      column =
        typeof measure.column === 'number'
          ? measure.column
          : serializeName(factTable, dialect) + '.' + serializeName(measure.column, dialect)

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
 * @param fact
 * @param measure
 * @param dialect
 * @returns
 */
export function serializeMeasure(
  cubeContext: CubeContext,
  measure: PropertyMeasure,
  aggregate: boolean,
  dialect: string
) {
  const { factTable } = cubeContext
  if (isCalculationProperty(measure)) {
    return serializeCalculationProperty(cubeContext, measure, aggregate, dialect)
  }

  let measureExpression = ''
  if (measure.measureExpression?.sql?.content) {
    measureExpression = measure.measureExpression.sql.content
  } else {
    measureExpression =
      typeof measure.column === 'number'
        ? measure.column
        : serializeName(factTable, dialect) + '.' + serializeName(measure.column, dialect)
  }

  return aggregate ? `${Aggregate(measureExpression, measure.aggregator)}` : measureExpression
}