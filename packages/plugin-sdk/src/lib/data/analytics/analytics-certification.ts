import { z } from 'zod/v3'
import type { AnalyticsCertification } from '@xpert-ai/contracts'

const identity = {
  kind: z.literal('business_metric'),
  subjectId: z.string().min(1).max(160),
  verifiedAt: z.string().datetime()
}

/** Parse only provider results. A valid shape alone never grants certification authority.
 * Legacy records remain explicitly unverified; approval fields require a verified source proof. */
export const analyticsCertificationSchema = z.discriminatedUnion('status', [
  z.object({ ...identity, status: z.literal('legacy_unverified') }).strict(),
  z
    .object({
      ...identity,
      status: z.literal('verified'),
      definitionHash: z.string().regex(/^[a-f0-9]{64}$/),
      dependency: z.object({ id: z.string().min(1).max(160), version: z.number().int().nonnegative() }).strict(),
      certifiedBy: z.string().min(1).max(160),
      certifiedAt: z.string().datetime()
    })
    .strict()
])

/** The package supports hosts compiled without strictNullChecks; parsing still requires every field. */
export function parseAnalyticsCertification(value: unknown): AnalyticsCertification {
  return analyticsCertificationSchema.parse(value) as AnalyticsCertification
}
