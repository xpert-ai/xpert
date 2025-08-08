import { z } from 'zod'
import { CalculatedMeasureSchema } from './calculated'


export const VirtualCubeDimensionSchema = z.object({
  cubeName: z.string().optional().nullable().describe('The name of the cube this dimension belongs to'),
  cubeCaption: z.string().optional().nullable().describe('The caption of the cube this dimension belongs to'),
  name: z.string().describe('The name of the virtual cube dimension'),
  caption: z.string().optional().nullable().describe('The caption of the virtual cube dimension'),
})

export const VirtualCubeMeasureSchema = z.object({
  cubeName: z.string().optional().nullable().describe('The name of the cube this measure belongs to'),
  cubeCaption: z.string().optional().nullable().describe('The caption of the cube this measure belongs to'),
  name: z.string().describe('The name of the virtual cube measure, format is `[Measures].[name of cube measure]`'),
  caption: z.string().optional().nullable().describe('The caption of the virtual cube measure'),
  visible: z.boolean().describe('Whether the measure is visible in the virtual cube'),
})

export const VirtualCubeSchema = z.object({
  name: z.string().describe('The name of the virtual cube'),
  caption: z.string().optional().nullable().describe('The caption of the virtual cube'),
  description: z.string().optional().nullable().describe('The description of the virtual cube'),
  cubeUsages: z
    .array(
      z.object({
        cubeName: z.string().describe('The name of the cube used in this virtual cube'),
        ignoreUnrelatedDimensions: z.boolean().optional().nullable().describe('Whether to ignore unrelated dimensions')
      })
    )
    .optional()
    .nullable()
    .describe('An array of cube usages in this virtual cube'),
  virtualCubeDimensions: z
    .array(VirtualCubeDimensionSchema)
    .optional()
    .nullable()
    .describe('An array of shared dimensions used in this virtual cube'),
  virtualCubeMeasures: z
    .array(VirtualCubeMeasureSchema)
    .optional()
    .nullable()
    .describe('An array of measures used in this virtual cube'),
  calculatedMembers: z
    .array(CalculatedMeasureSchema)
    .optional()
    .nullable()
    .describe('An array of calculated measures used in this virtual cube')
})