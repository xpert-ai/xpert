import { FormulaSchema } from "@metad/ocap-core"
import { z } from 'zod'


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