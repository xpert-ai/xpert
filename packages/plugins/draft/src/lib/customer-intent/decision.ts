import { z } from 'zod'
import { intentSchema } from './policy'

/** Recorded routing decision for feedback: the primary intent is served; an optional shadow intent is for comparison only. */
export const routeDecision = z.object({
  intent: intentSchema,
  features: z.array(z.string()).optional(),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  executionId: z.string(),
  bundleId: z.string(),
  bundleHash: z.string(),
  versionId: z.string(),
  channel: z.enum(['production', 'canary']),
  latencyMs: z.number().finite().nonnegative(),
  deploymentId: z.string().optional(),
  shadow: z
    .object({
      intent: intentSchema,
      bundleId: z.string(),
      deploymentId: z.string(),
      latencyMs: z.number().finite().nonnegative()
    })
    .optional()
})
