import { IndicatorType, SlicerSchema } from '@xpert-ai/ocap-core'
import { z } from 'zod'

/**
 * z.ZodType<Partial<Indicator>>
 */
export const IndicatorSchema = z
  .object({
    id: z.string().optional().describe(`The id of indicator`),
    code: z.string().describe(`The code of indicator, use alphabetic characters`),
    name: z.string().describe(`The name of indicator`),
    type: z
      .enum([IndicatorType.BASIC, IndicatorType.DERIVE])
      .describe(`BASIC: is basic indicator, DERIVE: is derived indicator using formula to calculate result`),
    modelId: z.string().describe(`The model id that indicator belongs to`),
    entity: z.string().describe(`The cube name that indicator belongs to`),
    calendar: z.string().optional().describe(`The calendar dimension or hierarchy`),
    dimensions: z
      .array(z.string().describe('Dimension or hierarchy'))
      .optional()
      .describe('The dimensions that not restricted by filters'),
    filters: z.array(SlicerSchema).optional().describe('The filters to restrict the indicator'),
    variables: z.array(SlicerSchema).optional().describe('The variables (parameters) of cube'),
    measure: z.string().optional().describe(`Measure name when indicator type is 'BASIC'`),
    formula: z.string().optional().describe(`MDX formula when indicator type is 'DERIVE'`),
    unit: z.string().optional().describe(`The unit of indicator`),
    // basic info
    isApplication: z.boolean().optional().describe(`The indicator can be show in indicator application if it has calendar dimension`),
    businessAreaId: z.string().optional().describe(`Business area the indicator should belong to`),
    business: z.string().describe(`A language description of the indicator from a caliber perspective.`),
    tags: z.array(z.object({
      id: z.string().describe(`Id of tag`)
    })).optional().describe(`Relative tags of the indicator`)
  })
  .describe('Indicator')

export const IndicatorFormulaSchema = z
.object({
  // code: z.string().describe(`The code of indicator`),
  formula: z.string().describe(`The MDX formula of indicator`),
  unit: z.string().optional().describe(`The unit of formula result`)
})