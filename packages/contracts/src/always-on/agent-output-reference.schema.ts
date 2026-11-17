import { z } from 'zod/v3'

const key = z.string().min(1).max(160)

/**
 * Validates the immutable reference a source hands to the outbox. The key and revision use
 * the source's vocabulary, such as a review run ID and its Git commit SHA.
 */
export const agentOutputReferenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: key,
    key,
    revision: key,
    publishedAt: z.string().datetime(),
    recipientId: z.string().uuid()
  })
  .strict()
