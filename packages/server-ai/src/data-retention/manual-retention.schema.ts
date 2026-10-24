import type { ManualRetentionRange } from '@xpert-ai/contracts'
import { z } from 'zod'

export const manualRetentionRangeSchema = z
    .object({
        target: z.enum(['copilot_checkpoint', 'model_gateway_call']),
        start: z.string().datetime({ offset: true }),
        end: z.string().datetime({ offset: true })
    })
    .strict()
    .refine((value) => Date.parse(value.start) < Date.parse(value.end), 'Invalid time range')
    .refine((value) => Date.parse(value.end) <= Date.now(), 'The end must not be in the future')
    .transform((value): ManualRetentionRange => ({ target: value.target, start: value.start, end: value.end }))

export const manualRetentionExecuteSchema = z
    .object({
        previewToken: z.string().uuid(),
        confirmed: z.literal(true)
    })
    .strict()

export const storedRetentionPreviewSchema = z
    .object({
        actorId: z.string().min(1),
        tenantId: z.string().min(1),
        expiresAt: z.number(),
        range: manualRetentionRangeSchema,
        ids: z.array(z.string().uuid()).max(1000)
    })
    .strict()

export type ManualRetentionExecute = z.output<typeof manualRetentionExecuteSchema>
