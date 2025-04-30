import { z } from 'zod'
import { OrderBy, OrderDirection } from '../../orderby'
import { C_MEASURES, Dimension, isDimension, isMeasure, Measure } from '../../types'
import { AggregationRole, EntityType, getEntityProperty2, unwrapBrackets } from '../../models'
import { omit } from '../../utils'

export const DataSettingsSchema = z.object({
  dataSource: z.string().describe('The name of the data source'),
  entitySet: z.string().describe('The name of the cube')
})

export const baseDimensionSchema = {
  dimension: z.string().describe('The name of the dimension using pattern `[Dimension Name]`'),
  hierarchy: z
    .string()
    .optional()
    .describe('The name of the hierarchy of the dimension using pattern `[Hierarchy Name]`'),
  level: z
    .string()
    .optional()
    .describe('The name of the level in the hierarchy using pattern `[Hierarchy Name].[Level Name]`')
}

export const DimensionSchema = z.object(baseDimensionSchema)

export const BaseMeasureSchema = {
  dimension: z.enum([C_MEASURES]),
  measure: z.string().describe('The name of the measure'),
  // order: z.enum([OrderDirection.ASC, OrderDirection.DESC]).optional().describe('The order of the measure'),
  chartOptions: z.any().optional().describe('The chart options of ECharts library')
}
export const MeasureSchema = z.object({
  ...BaseMeasureSchema
})

export const MemberSchema = z.object({
  key: z.string().describe('the UniqueName of dimension member, for example: `[MemberKey]`'),
  caption: z.string().optional().describe('the caption of dimension member')
})

export const DimensionMemberSchema = z.object({
  ...baseDimensionSchema,
  members: z.array(MemberSchema).optional().describe('Members in the dimension')
})
export const FormulaSchema = z.string().describe('MDX expression for the calculated measure in cube')

export const CalculationSchema = z.object({
  __id__: z.string().optional().describe(`Key of the calculation measure`),
  name: z.string().optional().describe(`Name of the calculation measure, should be unique`),
  caption: z.string().optional().describe('Caption (short description)'),
  description: z.string().optional().describe('Long description'),
  formula: FormulaSchema,
  formatting: z
    .object({
      unit: z.string().optional().describe('Unit of the measure; if this is a ratio measurement, value is `%`'),
      decimal: z.number().optional().describe('The decimal of value when formatting the measure')
    })
    .optional()
    .describe('The formatting config of this measure')
})

export const OrderBySchema = z.object({
  by: z.string().describe('Field to order by'),
  order: z.enum([OrderDirection.ASC, OrderDirection.DESC]).describe('Order direction')
})

export const VariableSchema = z.object({
  dimension: z
      .object({
        dimension: z.string().describe('The name of the dimension'),
        hierarchy: z.string().optional().describe('The name of the hierarchy in the dimension'),
        parameter: z.string().optional().describe('The name of variable reference to')
      })
      .describe('dimension of the variable'),
  members: z.array(z.object({
    key: z.string().describe('the UniqueName of dimension member, for example: `[MemberKey]`'),
    caption: z.string().optional().describe('the caption of dimension member')
  })).describe('Members in the variable')
})

/**
 * Due to the instability of the AI's returned results, it is necessary to attempt to fix dimensions for different situations:
 * The dimensional attributes returned by AI may be level, hierarchy or dimension.
 *
 * @param entityType
 * @param dimension
 * @returns
 */
export function tryFixDimension(dimension: Dimension | Measure, entityType: EntityType) {
  if (!entityType) {
    return dimension
  }

  let property = null
  if (isDimension(dimension)) {
    if (dimension.level) {
      property = getEntityProperty2(entityType, dimension.level)
    } else if (dimension.hierarchy) {
      property = getEntityProperty2(entityType, dimension.hierarchy)
    } else if (dimension.dimension) {
      property = getEntityProperty2(entityType, dimension.dimension)
    }
  } else {
    property = getEntityProperty2(entityType, dimension)
    // Fix meausure name format
    if (!property && dimension.measure) {
      const name = unwrapBrackets(dimension.measure.replace('[Measures].', ''))
      property = getEntityProperty2(entityType, name)
    }
  }

  const _dimension = omit(dimension, 'level', 'hierarchy', 'dimension')
  switch (property?.role) {
    case AggregationRole.dimension:
      return {
        ..._dimension,
        dimension: property.name,
        zeroSuppression: true
      } as Dimension
    case AggregationRole.hierarchy:
      return {
        ..._dimension,
        dimension: property.dimension,
        hierarchy: property.name,
        zeroSuppression: true
      }
    case AggregationRole.level:
      return {
        ..._dimension,
        dimension: property.dimension,
        hierarchy: property.hierarchy,
        level: property.name,
        zeroSuppression: true
      }
    case AggregationRole.measure:
      return {
        ..._dimension,
        dimension: C_MEASURES,
        measure: property.name,
        zeroSuppression: true
      }
    default:
      throw new Error(`Can't find property for '${isMeasure(dimension) ? dimension.measure : dimension.dimension}'`)
  }
}

export function tryFixOrder(orderBy: OrderBy) {
  const by = tryFixMeasureName(orderBy.by)
  return {...orderBy, by}
}

export function tryFixMeasureName(measure: string) {
  const name = unwrapBrackets(measure?.replace('[Measures].', ''))
  return name
}