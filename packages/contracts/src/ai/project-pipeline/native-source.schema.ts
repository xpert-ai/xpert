import { z } from 'zod/v3'
import { projectPipelineKeySchema } from './primitives.schema'

/** Host-issued dispatch lease; a reference is not authorization until revalidated against durable work. */
export const projectPipelineNativeDispatchSchema = z
  .object({
    kind: z.literal('provider_action'),
    operationId: z.string().uuid(),
    leaseOwner: z.string().uuid(),
    leaseFence: z.number().int().positive().safe()
  })
  .strict()
export const projectPipelineNativeSourceSchema = projectPipelineNativeDispatchSchema.extend({
  callKey: projectPipelineKeySchema
})
export type ProjectPipelineNativeDispatch = z.output<typeof projectPipelineNativeDispatchSchema>
export type ProjectPipelineNativeSource = z.output<typeof projectPipelineNativeSourceSchema>
