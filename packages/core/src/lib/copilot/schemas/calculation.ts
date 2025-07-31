import { z } from 'zod'
import { CalculationType } from '../../models'
import { SlicerSchema } from './slicer'

export const BaseCalculationSchema = {
  name: z.string().describe('Name of the calculation; Name cannot be repeated.'),
  caption: z.string().describe('Caption (short description)'),
  description: z.string().optional().nullable().describe('Long description'),
  calculationType: z.enum([CalculationType.Calculated, CalculationType.Restricted]).describe('Type of calculation'),
  formula: z.string().optional().nullable().describe(`MDX expression for the calculation if it is a '${CalculationType.Calculated}' calculation`),
  measure: z.string().optional().nullable().describe(`The measure for the calculation if it is a '${CalculationType.Restricted}' calculation`),
  slicers: z.array(SlicerSchema).optional().nullable().describe('The slicers to restrict measure'),
  formatting: z
    .object({
      unit: z.string().optional().nullable().describe('Unit of the calculation measure; if this is a ratio measurement, value is `%`'),
      decimal: z.number().or(z.string()).optional().nullable().describe('The decimal of value when formatting the calculation measure')
    })
    .optional()
    .nullable()
    .describe('The formatting config of this calculation')
}

/**
 * Calculation schema for defining a calculation in cube
 */
// export const CalculationSchema = z.object(BaseCalculationSchema)
