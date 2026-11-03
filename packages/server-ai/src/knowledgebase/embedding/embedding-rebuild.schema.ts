import { z } from 'zod/v3'

export const embeddingBatchSizeSchema = z.number().int().min(1).max(2048)
export const embeddingRebuildSchema = z
    .object({ embeddingBatchSize: embeddingBatchSizeSchema.optional() })
    .strict()
    .default({})
export type EmbeddingRebuildInput = z.output<typeof embeddingRebuildSchema>
