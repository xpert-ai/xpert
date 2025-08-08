import { z } from 'zod'
import { CubeParameterEnum } from '../../models'

export const BaseParameterSchema = {
  name: z.string().describe('Name of the parameter; Name cannot be repeated.'),
  caption: z.string().describe('Caption (short description)'),
  description: z.string().optional().nullable().describe('Long description'),
  paramType: z
    .enum([CubeParameterEnum.Input, CubeParameterEnum.Select])
    .describe('Type of the parameter'),
  value: z.string().or(z.number()).optional().nullable().describe('Default value of the parameter'),
  availableMembers: z
    .array(
      z.object({
        key: z.string().describe('Key of the member'),
        caption: z.string().optional().nullable().describe('Caption of the member')
      })
    )
    .optional()
    .nullable()
    .describe('Available members for the parameter if it is a select type')
}

/**
 * Parameter schema for defining a parameter in cube
 */
export const ParameterSchema = z.object(BaseParameterSchema)
