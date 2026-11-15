import { agentOutputDeliverySchema } from './agent-output-delivery.model'
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

export const projectTaskReviewerSchema = z
  .object({
    bindingId: z.string().uuid(),
    mode: z.enum(['evidence_only', 'execution'])
  })
  .strict()
export type ProjectTaskReviewer = z.output<typeof projectTaskReviewerSchema>

/** Host-owned identity of a review work item; retries cannot change its candidate. */
export const projectTaskReviewSubjectSchema = z
  .object({
    implementationTaskId: z.string().uuid(),
    implementationExecutionId: z.string().uuid(),
    specificationDigest: projectTaskSpecificationDigestSchema
  })
  .strict()
export type ProjectTaskReviewSubject = z.output<typeof projectTaskReviewSubjectSchema>

export const projectTaskReworkSchema = z
  .object({
    reviewExecutionId: z.string().uuid(),
    feedback: z
      .string()
      .trim()
      .min(1)
      .max(16000)
      .describe('Concrete rework instructions based on the referenced Markdown review.')
  })
  .strict()

/** Relative paths are references, never access grants. Runtimes own snapshot exclusions and containment. */
const projectTaskRelativePathSchema = z
  .string()
  .min(1)
  .max(1000)
  .refine(
    (value) =>
      !/^(?:\/|[a-zA-Z]:)/.test(value) &&
      !value.includes('\\') &&
      !/[\x00-\x1f\x7f]/.test(value) &&
      value.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..')
  )
export const projectTaskCandidatePathSchema = projectTaskRelativePathSchema.describe(
  'Candidate path relative to the authorized project workspace.'
)
export const projectTaskEvidencePathSchema = projectTaskRelativePathSchema.describe(
  'Evidence path relative to the review workspace.'
)

const projectTaskExecutionPurposeFieldsSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('implementation'),
      reviewer: projectTaskReviewerSchema.optional(),
      coordination: z
        .object({ taskId: z.string().uuid(), specificationDigest: projectTaskSpecificationDigestSchema })
        .strict()
        .optional(),
      rework: projectTaskReworkSchema.optional()
    })
    .strict(),
  z
    .object({
      type: z.literal('review'),
      mode: z.enum(['evidence_only', 'execution']).optional(),
      candidatePaths: z.array(projectTaskCandidatePathSchema).min(1).max(64).optional(),
      implementationExecutionId: z.string().uuid(),
      implementationTaskId: z.string().uuid().optional(),
      implementationInvocationId: z.string().uuid(),
      specificationDigest: projectTaskSpecificationDigestSchema,
      evidence: z.array(projectTaskEvidenceReferenceSchema).min(1).max(64)
    })
    .strict()
])
function validateReviewCandidate(
  purpose: z.output<typeof projectTaskExecutionPurposeFieldsSchema>,
  context: z.RefinementCtx
) {
  if (purpose.type !== 'review') return
  if ((purpose.mode === 'execution') !== Boolean(purpose.candidatePaths))
    context.addIssue({
      code: 'custom',
      path: ['candidatePaths'],
      message: 'Execution review requires candidate paths; evidence-only review does not use a workspace.'
    })
  if (purpose.candidatePaths && new Set(purpose.candidatePaths).size !== purpose.candidatePaths.length)
    context.addIssue({ code: 'custom', path: ['candidatePaths'], message: 'Candidate paths must be unique.' })
}
export const projectTaskExecutionPurposeSchema =
  projectTaskExecutionPurposeFieldsSchema.superRefine(validateReviewCandidate)
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

/** Explicit delegation. Routing and actor identity come from the host. */
const projectTaskDispatchFieldsSchema = z
  .object({
    requestId: z.string().uuid(),
    taskId: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    bindingId: z.string().uuid().optional(),
    target: z
      .object({ type: z.literal('group_member'), participantId: z.string().uuid() })
      .strict()
      .optional(),
    purpose: projectTaskExecutionPurposeSchema.optional(),
    reviewAsSubtask: z
      .boolean()
      .optional()
      .describe(
        'Create or resume a review subtask for the pinned implementation. taskId identifies the implementation task.'
      ),
    delivery: agentOutputDeliverySchema.optional(),
    instructions: z.string().trim().max(16000).default('')
  })
  .strict()
const hasOneDispatchTarget = (input: {
  bindingId?: string
  target?: { type?: 'group_member'; participantId?: string }
}) => Boolean(input.bindingId) !== Boolean(input.target)
export const projectTaskDispatchInputSchema = projectTaskDispatchFieldsSchema.refine(
  hasOneDispatchTarget,
  'Choose exactly one Runtime binding or group member'
)
export const projectTaskDispatchToolInputSchema = projectTaskDispatchFieldsSchema
  .omit({ requestId: true })
  .extend({
    purpose: z
      .discriminatedUnion('type', [
        projectTaskExecutionPurposeFieldsSchema.options[0].omit({ coordination: true }),
        projectTaskExecutionPurposeFieldsSchema.options[1].omit({ implementationTaskId: true })
      ])
      .superRefine(validateReviewCandidate)
      .optional()
  })
  .refine(hasOneDispatchTarget, 'Choose exactly one Runtime binding or group member')
export type ProjectTaskDispatchInput = z.output<typeof projectTaskDispatchInputSchema>

/** Markdown is authored evidence. Only an explicit coordinator decision accepts a task. */
export const projectTaskReviewReportSchema = z
  .object({
    format: z.literal('markdown'),
    markdown: z.string().min(1)
  })
  .strict()
export type ProjectTaskReviewReport = z.output<typeof projectTaskReviewReportSchema>

// Agent-facing references bind an observed candidate; authorization remains with the host.
export const projectTaskDecisionToolInputSchema = z
  .object({
    decisionRef: z
      .string()
      .max(200)
      .regex(/^pd1\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f]{64}$/),
    outcome: z.enum(['accept', 'rework']),
    rationale: z.string().trim().min(1).max(8000),
    checks: z.array(z.string().trim().min(1).max(4000)).max(64).optional()
  })
  .strict()
export type ProjectTaskDecisionToolInput = z.output<typeof projectTaskDecisionToolInputSchema>

export const projectTaskDecisionInputSchema = z
  .object({
    requestId: z.string().uuid(),
    taskId: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    implementationExecutionId: z.string().uuid(),
    specificationDigest: projectTaskSpecificationDigestSchema,
    evidence: z.array(projectTaskEvidenceReferenceSchema).min(1).max(64),
    reviewExecutionId: z.string().uuid().optional(),
    outcome: z.enum(['accept', 'rework']),
    rationale: z.string().trim().min(1).max(8000),
    checks: z.array(z.string().trim().min(1).max(4000)).max(64)
  })
  .strict()
export type ProjectTaskDecisionInput = z.output<typeof projectTaskDecisionInputSchema>
export const projectTaskDecisionSchema = projectTaskDecisionInputSchema
  .extend({
    actorId: z.string().uuid(),
    actorType: z.enum(['user', 'xpert', 'project_agent']),
    executionId: z.string().uuid().optional(),
    reviewResult: z
      .object({
        invocationId: z.string().uuid(),
        revision: z.number().int().nonnegative(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/)
      })
      .strict()
      .optional(),
    decidedAt: z.string().datetime(),
    taskRevision: z.number().int().positive()
  })
  .strict()
export type ProjectTaskDecision = z.output<typeof projectTaskDecisionSchema>
