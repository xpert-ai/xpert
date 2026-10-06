import { z } from 'zod/v3'
import { agentInvocationStatusSchema } from './agent-runtime.model'

export const projectTaskSpecificationDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)

/** Only requirements belong here; status, progress, assignment and generic revision do not. */
export const projectTaskSpecificationSchema = z
  .object({
    version: z.literal(1),
    title: z.string().trim().min(1).max(500),
    description: z.string().max(32000).optional(),
    requirements: z.array(z.string().trim().min(1).max(4000)).min(1).max(64),
    steps: z
      .array(
        z
          .object({
            stepIndex: z.number().int().positive(),
            description: z.string().trim().min(1).max(4000)
          })
          .strict()
      )
      .max(128)
  })
  .strict()
  .refine(
    (specification) => new Set(specification.steps.map((step) => step.stepIndex)).size === specification.steps.length,
    'Step indices must be unique'
  )
export type ProjectTaskSpecification = z.output<typeof projectTaskSpecificationSchema>

/** The host verifies the digest against the specification at the persistence boundary. */
export const projectTaskSpecificationSnapshotSchema = z
  .object({
    digest: projectTaskSpecificationDigestSchema,
    specification: projectTaskSpecificationSchema
  })
  .strict()
export type ProjectTaskSpecificationSnapshot = z.output<typeof projectTaskSpecificationSnapshotSchema>

/** Versioned references, not paths or access grants. Resolve and authorize before reading. */
export const projectTaskEvidenceReferenceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('artifact'), artifactId: z.string().uuid(), versionId: z.string().uuid() }).strict(),
  z
    .object({
      type: z.literal('invocation_result'),
      invocationId: z.string().uuid(),
      revision: z.number().int().nonnegative()
    })
    .strict(),
  z
    .object({
      type: z.literal('workspace_snapshot'),
      snapshotId: z.string().uuid(),
      digest: projectTaskSpecificationDigestSchema
    })
    .strict()
])
export type ProjectTaskEvidenceReference = z.output<typeof projectTaskEvidenceReferenceSchema>

export const projectTaskExecutionPurposeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('implementation') }).strict(),
  z
    .object({
      type: z.literal('review'),
      implementationExecutionId: z.string().uuid(),
      implementationInvocationId: z.string().uuid(),
      specificationDigest: projectTaskSpecificationDigestSchema,
      evidence: z.array(projectTaskEvidenceReferenceSchema).min(1).max(64)
    })
    .strict()
])
export type ProjectTaskExecutionPurpose = z.output<typeof projectTaskExecutionPurposeSchema>

export const projectTaskExecutionReferenceSchema = z
  .object({
    projectId: z.string().uuid(),
    projectTaskId: z.string().uuid(),
    taskExecutionId: z.string().uuid()
  })
  .strict()
export type ProjectTaskExecutionReference = z.output<typeof projectTaskExecutionReferenceSchema>

/** Host-owned attempt context. Review is a new attempt and grants no completion authority. */
export const projectTaskExecutionContextSchema = projectTaskExecutionReferenceSchema
  .extend({
    specification: projectTaskSpecificationSnapshotSchema,
    purpose: projectTaskExecutionPurposeSchema
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.purpose.type !== 'review') return
    if (value.purpose.implementationExecutionId === value.taskExecutionId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['purpose'], message: 'Review must reference another attempt' })
    }
    if (value.purpose.specificationDigest !== value.specification.digest) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['purpose'],
        message: 'Review specification must match its subject'
      })
    }
  })
export type ProjectTaskExecutionContext = z.output<typeof projectTaskExecutionContextSchema>

/** A receipt is neither a business completion decision nor proof that the process has started. */
export const projectTaskDispatchReceiptSchema = projectTaskExecutionReferenceSchema
  .extend({
    invocationId: z.string().uuid(),
    status: agentInvocationStatusSchema
  })
  .strict()
export type ProjectTaskDispatchReceipt = z.output<typeof projectTaskDispatchReceiptSchema>
