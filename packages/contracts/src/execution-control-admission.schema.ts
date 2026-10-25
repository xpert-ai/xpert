import { z } from 'zod'

/** Internal boot capabilities. Online/readiness and execution settlement remain separate facts. */
export const executionControlProtocols = {
  taskControl: 2,
  managedQueue: 3,
  threadControlView: 1,
  mcpControl: 1,
  sandboxControl: 1,
  invocationEvidence: 2
} as const
export type ExecutionControlCapability = keyof typeof executionControlProtocols

export const controlledHandlerSchema = z
  .object({
    pluginName: z.string().min(1),
    queueName: z.string().min(1),
    jobName: z.string().min(1),
    scopeKey: z.string().nullable(),
    controlContract: z.string().min(1).max(160)
  })
  .strict()
export type ControlledHandlerCapability = z.infer<typeof controlledHandlerSchema>

export const executionControlCapabilitiesSchema = z
  .object({
    version: z.literal(1),
    validUntil: z.number().finite(),
    protocols: z
      .object({
        taskControl: z.literal(2).optional(),
        managedQueue: z.literal(3).optional(),
        threadControlView: z.literal(1).optional(),
        mcpControl: z.literal(1).optional(),
        sandboxControl: z.literal(1).optional(),
        invocationEvidence: z.literal(2).optional()
      })
      .strict(),
    queuePrefix: z.string().min(1).max(160),
    queuePools: z.array(z.enum(['default', 'sandbox-browser'])),
    handlers: z.array(controlledHandlerSchema)
  })
  .strict()
export type ExecutionControlCapabilities = z.infer<typeof executionControlCapabilitiesSchema>
