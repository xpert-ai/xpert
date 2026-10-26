import { z } from 'zod/v3'

/** A control request can address only the original environment and execution generation. */
export const sandboxRuntimeTargetSchema = z
  .object({
    version: z.literal(1),
    kind: z.enum(['host', 'engine']),
    provider: z.string().min(1),
    runtimeProfile: z.string().min(1),
    generation: z.string().uuid(),
    environmentId: z.string().min(1),
    runtimeRef: z.string().min(1)
  })
  .strict()
export type SandboxRuntimeTarget = z.output<typeof sandboxRuntimeTargetSchema>

/** An accepted stop, closed stream, or expired lease is never an exit receipt. */
export const sandboxRuntimeEvidenceSchema = z
  .object({
    version: z.literal(1),
    target: sandboxRuntimeTargetSchema,
    state: z.enum(['running', 'exited', 'not_started', 'unknown']),
    observedAt: z.string().datetime()
  })
  .strict()
export type SandboxRuntimeEvidence = z.output<typeof sandboxRuntimeEvidenceSchema>

export function sandboxTargetsEqual(a: SandboxRuntimeTarget, b: SandboxRuntimeTarget): boolean {
  return (
    a.version === b.version &&
    a.kind === b.kind &&
    a.provider === b.provider &&
    a.runtimeProfile === b.runtimeProfile &&
    a.generation === b.generation &&
    a.environmentId === b.environmentId &&
    a.runtimeRef === b.runtimeRef
  )
}

export function sandboxEvidence(
  target: SandboxRuntimeTarget,
  state: SandboxRuntimeEvidence['state']
): SandboxRuntimeEvidence {
  return { version: 1, target, state, observedAt: new Date().toISOString() }
}

/** Explicit new business retry; it may proceed only after this original generation settled. */
export const sandboxJobRetryReferenceSchema = z
  .object({ jobId: z.string().uuid(), generation: z.string().uuid() })
  .strict()
export type SandboxJobRetryReference = z.output<typeof sandboxJobRetryReferenceSchema>
