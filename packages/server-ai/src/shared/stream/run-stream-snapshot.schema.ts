import { z } from 'zod'

export const runStreamInterruptSchema = z
    .object({
        tasks: z.array(
            z
                .object({
                    interrupts: z.array(z.object({ value: z.unknown() }).passthrough())
                })
                .passthrough()
        )
    })
    .passthrough()

export const runStreamSnapshotPayloadSchema = z.object({
    version: z.literal(1),
    finished: z.boolean(),
    pendingInterrupt: runStreamInterruptSchema.nullish(),
    activeMessageId: z.string().nullable(),
    messages: z.array(
        z
            .object({
                id: z.string(),
                executionId: z.string().nullish(),
                conversationId: z.string(),
                role: z.string(),
                status: z.string().nullish(),
                error: z.string().nullish(),
                content: z.union([z.string(), z.array(z.object({ type: z.string() }).passthrough())]),
                reasoning: z.array(z.unknown()).nullish(),
                references: z.array(z.unknown()).nullish(),
                events: z.array(z.unknown()).nullish(),
                agentRuns: z.array(z.unknown()).optional()
            })
            .passthrough()
    )
})
export type RunStreamSnapshotPayload = z.output<typeof runStreamSnapshotPayloadSchema>
