import { z } from 'zod'
import { ChartDimensionRoleType, ChartMeasureRoleType } from '../../annotations'
import { baseDimensionSchema, BaseMeasureSchema } from './common'

export const ChartDimensionSchema = z.object({
  ...baseDimensionSchema,
  role: z
    .enum([ChartDimensionRoleType.Time, ChartDimensionRoleType.Stacked, ChartDimensionRoleType.Group])
    .nullable()
    .optional()
    .describe('Role of category axis')
})

export const ChartMeasureSchema = z.object({
  ...BaseMeasureSchema,
  role: z
    .enum([ChartMeasureRoleType.Axis1, ChartMeasureRoleType.Axis2])
    .nullable()
    .optional()
    .describe('Role of value axis'),
  shapeType: z.enum(['line', 'bar', 'scatter', null]).nullable().optional().describe('Corresponding to the series type in ECharts. If not specified, visualType is used'),
})
