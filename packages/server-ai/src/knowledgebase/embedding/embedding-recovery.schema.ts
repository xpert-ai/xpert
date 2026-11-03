import { z } from 'zod/v3'
export const embeddingRecoverySchema = z.object({}).strict()
export type EmbeddingRecoveryInput = z.output<typeof embeddingRecoverySchema>
