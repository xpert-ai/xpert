import { z } from 'zod/v3'

/** Context revision and runtime scope delivered by an authorized Remote View host. */
export const viewContextEventSchema = z.object({
  type: z.literal('view.context.changed'),
  data: z.object({
    revision: z.number().int().nonnegative(),
    runtimeScope: z.object({ projectId: z.string().nullish(), conversationId: z.string().nullish() })
  })
}).transform(({ type, data }) => ({
  type,
  // Keep required envelope fields explicit in declarations built without strictNullChecks.
  data: { revision: data.revision, runtimeScope: data.runtimeScope }
}))
