import { z } from 'zod/v3'
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const executionReconciliationSchema = z
    .object({
        operationId: z.string().uuid(),
        evidenceReference: z.string().trim().min(1).max(256),
        evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
        reason: z.string().trim().min(10).max(1000),
        providerRequestId: z.string().trim().min(1).max(256),
        outcome: z.enum(['provider_usage', 'no_usage']),
        inputTokens: count,
        outputTokens: count,
        totalTokens: count,
        priceAmount: z.number().finite().nonnegative().nullable(),
        priceCurrency: z.string().trim().min(1).max(20).nullable()
    })
    .strict()
    .refine(
        (value) =>
            value.totalTokens === value.inputTokens + value.outputTokens &&
            (value.outcome === 'no_usage'
                ? value.totalTokens === 0 && value.priceAmount === 0
                : value.totalTokens > 0) &&
            (value.priceAmount === null || value.priceCurrency !== null)
    )
export type ExecutionReconciliationInput = z.output<typeof executionReconciliationSchema>
