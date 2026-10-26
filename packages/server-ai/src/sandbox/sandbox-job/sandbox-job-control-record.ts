import { sandboxRuntimeEvidenceSchema, sandboxRuntimeTargetSchema, sandboxTargetsEqual } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import type { SandboxJobEntity } from './sandbox-job.entity'

export const sandboxJobControlSchema = z
    .object({
        version: z.literal(1),
        hostId: z.string().uuid(),
        taskId: z.string().uuid(),
        claim: z.string().uuid(),
        providerVersion: z.string().min(1),
        phase: z.enum(['reserved', 'creating', 'running', 'settled']),
        hostExited: z.boolean(),
        controlFailures: z.number().int().nonnegative().optional(),
        reportedOutcome: z.enum(['succeeded', 'failed', 'cancelled']).optional(),
        target: sandboxRuntimeTargetSchema.optional(),
        evidence: sandboxRuntimeEvidenceSchema.optional()
    })
    .strict()
export type SandboxJobControlRecord = z.output<typeof sandboxJobControlSchema>

/** Persisted JSON is parsed only at the repository boundary. */
export function readControlledSandboxJob(job: SandboxJobEntity): SandboxJobEntity {
    if (job.control) {
        job.control = sandboxJobControlSchema.parse(job.control)
        z.string().uuid().parse(job.generation)
        if (job.control.target && job.control.target.generation !== job.generation)
            throw new Error('Sandbox execution generation mismatch')
        if (
            job.control.target &&
            (job.control.target.provider !== job.provider || job.control.target.runtimeProfile !== job.runtimeProfile)
        )
            throw new Error('Sandbox execution provider/profile mismatch')
        if (
            job.control.evidence &&
            (!job.control.target || !sandboxTargetsEqual(job.control.target, job.control.evidence.target))
        )
            throw new Error('Sandbox evidence target mismatch')
    }
    return job
}
