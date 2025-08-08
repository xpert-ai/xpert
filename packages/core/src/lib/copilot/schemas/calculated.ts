import { z } from 'zod'

export const BaseCalculatedMeasureSchema = {
  name: z.string().describe('Name of the calculated measure; Name cannot be repeated.'),
  caption: z.string().describe('Caption (short description)'),
  description: z.string().optional().nullable().describe('Long description'),
  formula: z.string().describe('MDX expression for the calculated measure in cube'),
  formatting: z
    .object({
      unit: z.string().optional().nullable().describe('Unit of the measure; if this is a ratio measurement, value is `%`'),
      decimal: z.number().or(z.string()).optional().nullable().describe('The decimal of value when formatting the measure')
    })
    .optional()
    .nullable()
    .describe('The formatting config of this measure')
}

/**
 * Calculated measure schema for defining a calculated measure in cube
 */
export const CalculatedMeasureSchema = z.object(BaseCalculatedMeasureSchema)
