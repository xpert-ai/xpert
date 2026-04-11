import { AggregationOperations, CompareToEnum, DimensionMemberSchema, DimensionSchema, DisplayBehaviour } from '@xpert-ai/ocap-core'
import { z } from 'zod'

/**
 * For {@link RestrictedMeasureProperty | restricted measure property}
 */
export const RestrictedMeasureSchema = z.object({
  __id__: z.string().optional().describe(`Key of the calculation measure`),
  name: z.string().optional().describe(`Name of the calculation measure`),
  caption: z.string().optional().describe(`Caption of the calculation measure`),
  measure: z.string().optional().describe(`The name of measure that restricted by the dimension members`),

  dimensions: z.array(DimensionMemberSchema),

  // slicers: z.array(SlicerSchema).optional().describe(`The slicers to restrict the calculation measure`),
  enableConstantSelection: z.boolean().optional().describe(`Enable constant selection of restricted measure`)
})

export const ConditionalAggregationSchema = z.object({
  __id__: z.string().optional().describe(`Key of the calculation measure`),
  name: z.string().describe(`Name of the calculation measure`),
  caption: z.string().optional().describe(`Caption of the calculation measure`),

  operation: z.enum([null, ...AggregationOperations.map(({value}) => value as string)]).describe(`The operation of conditional aggregation`),
  value: z.number().optional().describe(`The value of aggregation operation, only used for some operations: TopSum(memberSet, value), TopPercent(memberSet, value), TopCount(memberSet, value)`),
  measure: z.string().describe(`The name of measure that aggregation by the dimension members`),
  aggregationDimensions: z.array(DimensionMemberSchema).describe(`The dimensions to aggregation by`),
  useConditionalAggregation: z.boolean().optional().describe(`Use conditional aggregation`),
  conditionalDimensions: z.array(DimensionMemberSchema).optional().describe(`The restricted dimensions for measure`),
  excludeConditions: z.boolean().optional().describe(`Exclude the restricted conditions for measure`)
})

export const VarianceMeasureSchema = z.object({
  __id__: z.string().optional().describe(`Key of the calculation measure`),
  name: z.string().describe(`Name of the calculation measure`),
  caption: z.string().optional().describe(`Caption of the calculation measure`),

  measure: z.object({
    measure: z.string().describe(`The name of the measure`),
  }),
  baseDimension: DimensionSchema.describe(`The base dimension for variance measure, for example: time dimension or version dimension`),
  toB: z.object({
    type: z.enum([CompareToEnum.Lag, CompareToEnum.Lead, CompareToEnum.Parallel, CompareToEnum.Ancestor]).describe(`The type of compare to`),
    value: z.number().optional().describe(`The value of compare to type`)
  }),

  asZero: z.boolean().optional().describe(`As zero if the value is null`),
  asPercentage: z.boolean().optional().describe(`calculate as percentage`),
  directDivide: z.boolean().optional().describe(`Direct divide the value A / B, otherwise (A - B) / B`),
  absBaseValue: z.boolean().optional().describe(`Use absolute value of base value: (A - B) / abs(B)`),
})

export const MeasureControlSchema = z.object({
  __id__: z.string().optional().describe(`Key of the calculation measure`),
  name: z.string().describe(`Name of the calculation measure`),
  caption: z.string().optional().describe(`Caption of the calculation measure`),

  value: z.string().describe(`The name of the measure`),
  allMeasures: z.boolean().optional().describe(`Show all measures`),
  availableMembers: z.array(z.object({
    key: z.string().describe(`The name of the measure option`),
    caption: z.string().optional().describe(`The caption of the measure option`)
  })).describe(`The available measure options if not show all measures`),
  displayBehaviour: z.enum([DisplayBehaviour.descriptionAndId, DisplayBehaviour.descriptionOnly, DisplayBehaviour.idOnly]).optional().describe(`The display behaviour of measure options`),
})

export const AnalyticalGridOptionsSchema = z.object({
  showToolbar: z.boolean().optional().describe('Show toolbar of table grid'),
  strip: z.boolean().optional().describe('Strip rows of table grid'),
  grid: z.boolean().optional().describe('Table is grid style'),
  paging: z.boolean().optional().describe('Table is paging'),
  pageSize: z.number().optional().describe('Page size'),
  sticky: z.boolean().optional().describe('Sticky header of table'),
  initialRowLevel: z.number().optional().describe('Inital row level number'),
  initialColumnLevel: z.number().optional().describe('Inital column level number'),
  sortable: z.boolean().optional().describe('Columns of table is sortable'),
  selectable: z.boolean().optional().describe('Columns of table is selectable'),
  digitsInfo: z.string().default('0.1-1').optional().describe('Digits Info of measure value'),
  unit: z.string().optional().describe('Unit of measure value'),
  currencyCode: z.string().optional().describe('Currency Code of measure value'),
})