import { t } from 'i18next'
import { z } from 'zod'
import { OrderBy, OrderDirection } from '../../orderby'
import { C_MEASURES, Dimension, FilterOperator, isDimension, isMeasure, isMeasureName, Measure } from '../../types'
import { AggregationRole, EntityType, getEntityProperty2, PropertyDimension, PropertyHierarchy, PropertyLevel, unwrapBrackets } from '../../models'
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
    .nullable()
    .describe('The name of the hierarchy of the dimension using pattern `[Hierarchy Name]`. If there is only one hierarchy in the same dimension, please ignore this parameter.'),
  level: z
    .string()
    .optional()
    .describe('The name of the level in the hierarchy using pattern `[Hierarchy Name].[Level Name]`'),
  properties: z.array(
    z.string().describe('The name of property in level, using pattern `[Hierarchy name].[Property name]`')
  ).optional().nullable().describe('Show properties of level, this parameter is not required unless explicitly specified.')
}

export const DimensionSchema = z.object(baseDimensionSchema)

export const BaseMeasureSchema = {
  dimension: z.enum([C_MEASURES]),
  measure: z.string().describe('The name of the measure or indicator or calculated member'),
  // order: z.enum([OrderDirection.ASC, OrderDirection.DESC]).optional().describe('The order of the measure'),
  // chartOptions: z.any().optional().describe('The chart options of ECharts library')
}
export const MeasureSchema = z.object({
  ...BaseMeasureSchema
})

export const MemberSchema = z.object({
  key: z.string().describe('the UniqueName of dimension member, for example: `[MemberKey]`'),
  caption: z.string().optional().describe('the caption of dimension member'),
  operator: z.enum([FilterOperator.EQ, FilterOperator.Contains, FilterOperator.NotContains, FilterOperator.StartsWith, FilterOperator.NotStartsWith, FilterOperator.EndsWith, FilterOperator.NotEndsWith])
              .optional().nullable()
              .describe('The operator of the member, such as `Contains`, `StartsWith`, etc. If not specified, it defaults to `EQ` (equals).') 
})

export const DimensionMemberSchema = z.object({
  ...baseDimensionSchema,
  members: z.array(MemberSchema).optional().describe('Members in the dimension')
})
export const FormulaSchema = z.string().describe('MDX expression for the calculated measure in cube')



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
      property = getEntityProperty2<PropertyLevel>(entityType, dimension.level)
    } else if (dimension.hierarchy) {
      property = getEntityProperty2<PropertyHierarchy>(entityType, dimension.hierarchy)
    } else if (dimension.dimension) {
      property = getEntityProperty2<PropertyDimension>(entityType, dimension.dimension)
    }
    // Check properties validation
    dimension.properties?.forEach(prop => {
      if (property?.role === AggregationRole.level) {
        if (!(<PropertyLevel>property).properties.some(p => p.name === prop)) {
          throw new Error(t('Error.PropertyNotFoundInLevel', {ns: 'core', cube: entityType.name, level: property.name, property: prop}))
        }
      }
    })
  } else {
    property = getEntityProperty2(entityType, dimension)
    // Fix meausure name format
    if (!property && dimension.measure) {
      const name = tryFixMeasureName(dimension.measure)
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
      throw new Error(t('Error.NoPropertyFoundFor', {ns: 'core', cube: entityType.name, name: isMeasure(dimension) ? dimension.measure : dimension.dimension}))
  }
}

/**
 * Try to fix orderBy given by AI
 * 
 * - `[Measures].[Sales Amount]` to `Sales Amount`
 * 
 * @param orderBy 
 * @returns 
 */
export function tryFixOrder(orderBy: OrderBy) {
  const by = isMeasureName(orderBy.by) ? tryFixMeasureName(orderBy.by) : orderBy.by
  return {...orderBy, by}
}

/**
 * Try to fix: `[Measures].[Sales Amount]` to `Sales Amount`
 */
export function tryFixMeasureName(measure: string) {
  const name = unwrapBrackets(measure?.replace(`[${C_MEASURES}].`, ''))
  return name
}