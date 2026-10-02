import { z } from 'zod/v3'
import { ModelGatewayCallStatusEnum, ModelGatewayUsageSourceEnum } from '@xpert-ai/contracts'

export const executionCallQuerySchema = z
    .object({
        entry: z.enum(['cli', 'agent_runtime']).optional(),
        status: z.nativeEnum(ModelGatewayCallStatusEnum).optional(),
        assistantId: z.string().uuid().optional(),
        conversationId: z.string().uuid().optional(),
        executionId: z.string().uuid().optional(),
        tool: z.string().min(1).max(80).optional(),
        model: z.string().trim().min(1).max(191).optional(),
        environment: z.enum(['computer', 'sandbox', 'remote']).optional(),
        usageSource: z.nativeEnum(ModelGatewayUsageSourceEnum).optional(),
        pricingStatus: z.enum(['priced', 'free', 'unpriced', 'pending']).optional(),
        startedAfter: z.string().datetime({ offset: true }).optional(),
        startedBefore: z.string().datetime({ offset: true }).optional(),
        take: z.coerce.number().int().min(1).max(100).default(20),
        skip: z.coerce.number().int().min(0).max(100000).default(0)
    })
    .strict()
    .refine(
        (value) =>
            !value.startedAfter ||
            !value.startedBefore ||
            Date.parse(value.startedAfter) <= Date.parse(value.startedBefore)
    )

export type ExecutionCallQuery = z.output<typeof executionCallQuerySchema>
