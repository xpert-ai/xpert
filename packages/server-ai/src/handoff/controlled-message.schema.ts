import { z } from 'zod'
import type { HandoffMessage, ProcessResult } from '@xpert-ai/plugin-sdk'

const controlledMessageSchema = z.object({
    id: z.string(),
    type: z.string(),
    version: z.number().int(),
    tenantId: z.string().uuid(),
    sessionKey: z.string(),
    businessKey: z.string(),
    attempt: z.number().int(),
    maxAttempts: z.number().int(),
    enqueuedAt: z.number(),
    traceId: z.string(),
    parentMessageId: z.string().optional(),
    payload: z.record(z.string(), z.unknown()),
    headers: z.record(z.string(), z.string()).optional(),
    control: z.object({ version: z.literal(2), targetId: z.string().uuid() }),
    controlPolicy: z.enum(['attached', 'detached', 'shared']).optional()
})

export function parseControlledMessage(value: unknown): HandoffMessage & { control: { version: 2; targetId: string } } {
    return controlledMessageSchema.parse(value) as HandoffMessage & { control: { version: 2; targetId: string } }
}

export function parseProcessResult(value: unknown): ProcessResult {
    return z
        .discriminatedUnion('status', [
            z.object({
                status: z.literal('ok'),
                outbound: z
                    .array(
                        controlledMessageSchema
                            .omit({ control: true })
                            .extend({ control: controlledMessageSchema.shape.control.optional() })
                    )
                    .optional()
            }),
            z.object({ status: z.literal('retry'), delayMs: z.number(), reason: z.string().optional() }),
            z.object({ status: z.literal('dead'), reason: z.string() })
        ])
        .parse(value) as ProcessResult
}
