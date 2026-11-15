import { Injectable } from '@nestjs/common'
import { z } from 'zod/v3'
import { UserType, SecretTokenBindingType, projectPipelineSubjectVersionSchema } from '@xpert-ai/contracts'
import {
  ProjectPipelineRuntimeAdapterProvider as Adapter,
  ProjectPipelineEvidenceRuntimeCapability,
  ProjectAccessRuntimeCapability,
  RequestContext,
  type ProjectPipelineContext,
  type ProjectPipelineOperationContext,
  type ProjectPipelineAssistantContext,
  type ProjectPipelinePolicyEvaluator
} from '@xpert-ai/plugin-sdk'
import { CodingDeliveryStore, conflict } from './store'
import { CodingEvidenceService, evidenceRef } from './evidence'
import { evidenceSchema, type Phase } from './schemas'
import { refs } from './constants'
import { workPrompt } from './prompts'
import { deploymentRequestRef } from './deployment-request'

@Injectable()
@Adapter('subject', refs.subject)
export class CodingSubject {
  readonly kind = 'subject'
  readonly ref = refs.subject
  constructor(private readonly store: CodingDeliveryStore) {}
  async resolve(c: ProjectPipelineContext, key: string) {
    const row = await this.store.get(c, z.string().uuid().parse(key))
    await this.store.authorizeRequirement(c, row.requirement)
    return this.store.version(row)
  }
  async checkCurrent(c: ProjectPipelineContext, value: z.output<typeof projectPipelineSubjectVersionSchema>) {
    try {
      await this.store.current(c, value)
      return true
    } catch {
      return false
    }
  }
}
@Injectable()
@Adapter('schema', refs.subjectSchema)
export class CodingSubjectSchema {
  readonly kind = 'schema'
  readonly ref = refs.subjectSchema
  parse(value: unknown) {
    return projectPipelineSubjectVersionSchema.parse(value)
  }
}
@Injectable()
@Adapter('schema', refs.evidenceSchema)
export class CodingEvidenceSchema {
  readonly kind = 'schema'
  readonly ref = refs.evidenceSchema
  parse(value: unknown) {
    return evidenceSchema.parse(value)
  }
}
@Injectable()
@Adapter('evidence', refs.evidence)
export class CodingEvidenceResolver extends CodingEvidenceService {
  readonly kind = 'evidence'
  readonly ref = refs.evidence
}

const decision = z
  .object({
    kind: z.literal('human'),
    policyRef: z.literal(refs.approval),
    outcome: z.literal('approve'),
    actorId: z.string().uuid(),
    roundId: z.string().uuid(),
    inputDigest: z.string(),
    generation: z.number()
  })
  .passthrough()

@Injectable()
export class CodingOperations {
  constructor(
    private readonly store: CodingDeliveryStore,
    private readonly evidence: CodingEvidenceService
  ) {}
  async approved(c: ProjectPipelineOperationContext) {
    const input = c.inputs.approval
    if (input?.kind !== 'evidence' || input.value.resolverRef !== 'platform.pipeline-decision@1')
      throw conflict('CODING_HUMAN_APPROVAL_REQUIRED')
    const approved = decision.parse(
      await this.store.capabilities.require(ProjectPipelineEvidenceRuntimeCapability).read(c, input.value)
    )
    if (
      approved.roundId !== c.work.roundId ||
      approved.inputDigest !== c.work.inputDigest ||
      approved.generation !== c.work.generation
    )
      throw conflict('CODING_APPROVAL_SUPERSEDED')
    return { reference: input.value, decision: approved }
  }
  async prepare(c: ProjectPipelineAssistantContext, phase: Phase) {
    const delivery = await this.store.current(c, c.subjects[0])
    if (delivery.requirement.mode === 'local' && phase !== 'development')
      throw conflict('CODING_LOCAL_RELEASE_FORBIDDEN')
    const candidate = phase === 'development' ? undefined : await this.evidence.input(c, 'candidate')
    if (phase !== 'development') await this.approved(c)
    if (phase === 'git') await this.evidence.input(c, 'deployment')
    await this.store.begin(c, phase)
    return {
      prompt: workPrompt(phase, delivery.requirement, c, candidate),
      context: { codingDeliveryId: delivery.id, codingOperationId: c.work.operationId }
    }
  }
  async collect(c: ProjectPipelineAssistantContext, phase: Phase) {
    const row = await this.store.operation(c, c.work.operationId)
    await this.store.current(c, c.subjects[0])
    if (row.requirement.mode === 'local' && phase !== 'development') throw conflict('CODING_LOCAL_RELEASE_FORBIDDEN')
    if (row.phase !== phase || !row.evidence || row.context.executor.conversationId !== c.executor.conversationId)
      throw conflict('CODING_FORMAL_ACCEPTANCE_NOT_SUBMITTED')
    if (phase !== 'development') await this.approved(c)
    return { result: evidenceRef(row.evidence) }
  }
}

@Injectable()
@Adapter('assistant_operation', refs.development)
export class CodingDevelopmentOperation {
  readonly kind = 'assistant_operation'
  readonly ref = refs.development
  constructor(private readonly operations: CodingOperations) {}
  prepare(c: ProjectPipelineAssistantContext) {
    return this.operations.prepare(c, 'development')
  }
  collect(c: ProjectPipelineAssistantContext) {
    return this.operations.collect(c, 'development')
  }
}
@Injectable()
@Adapter('assistant_operation', refs.currentDevelopment)
export class CodingCurrentDevelopmentOperation {
  readonly kind = 'assistant_operation'
  readonly ref = refs.currentDevelopment
  constructor(
    private readonly operations: CodingOperations,
    private readonly evidence: CodingEvidenceService
  ) {}
  prepare(c: ProjectPipelineAssistantContext) {
    return this.operations.prepare(c, 'development')
  }
  async collect(c: ProjectPipelineAssistantContext) {
    const result = await this.operations.collect(c, 'development')
    return { ...result, request: deploymentRequestRef(await this.evidence.read(c, result.result)) }
  }
}
@Injectable()
@Adapter('assistant_operation', refs.deployment)
export class CodingDeploymentOperation {
  readonly kind = 'assistant_operation'
  readonly ref = refs.deployment
  constructor(private readonly operations: CodingOperations) {}
  prepare(c: ProjectPipelineAssistantContext) {
    return this.operations.prepare(c, 'deployment')
  }
  collect(c: ProjectPipelineAssistantContext) {
    return this.operations.collect(c, 'deployment')
  }
}
@Injectable()
@Adapter('assistant_operation', refs.currentDeployment)
export class CodingCurrentDeploymentOperation extends CodingDeploymentOperation {
  readonly ref = refs.currentDeployment
}
@Injectable()
@Adapter('assistant_operation', refs.git)
export class CodingGitOperation {
  readonly kind = 'assistant_operation'
  readonly ref = refs.git
  constructor(private readonly operations: CodingOperations) {}
  prepare(c: ProjectPipelineAssistantContext) {
    return this.operations.prepare(c, 'git')
  }
  collect(c: ProjectPipelineAssistantContext) {
    return this.operations.collect(c, 'git')
  }
}

@Injectable()
@Adapter('assistant_operation', refs.rework)
export class CodingReworkOperation {
  readonly kind = 'assistant_operation'
  readonly ref = refs.rework
  constructor(
    private readonly store: CodingDeliveryStore,
    private readonly evidence: CodingEvidenceService
  ) {}
  async prepare(c: ProjectPipelineAssistantContext) {
    await this.store.current(c, c.subjects[0])
    await this.evidence.input(c, 'candidate')
    const input = c.inputs.decision
    if (input?.kind !== 'evidence' || input.value.resolverRef !== 'platform.pipeline-decision@1')
      throw conflict('CODING_HUMAN_FEEDBACK_REQUIRED')
    const feedback = z
      .object({
        kind: z.literal('human'),
        policyRef: z.literal(refs.approval),
        outcome: z.literal('rework'),
        roundId: z.literal(c.work.roundId),
        inputDigest: z.literal(c.work.inputDigest),
        generation: z.literal(c.work.generation)
      })
      .passthrough()
      .parse(await this.store.capabilities.require(ProjectPipelineEvidenceRuntimeCapability).read(c, input.value))
    await this.store.begin(c, 'development')
    return {
      prompt: [
        'The human publisher returned this candidate for rework. Read coding_delivery_context, then call coding_delivery_rework once with concrete feedback from this decision.',
        'Do not code or redeploy in this coordination turn. The new Round will assign implementation and independent acceptance, and require fresh human approval.',
        'Read any decision evidence to understand the requested changes. If no concrete feedback was supplied, ask the publisher for the reason and wait. Do not invent requirements or blindly rerun the same candidate.',
        `Operation ID: ${c.work.operationId}. Human feedback: ${JSON.stringify(feedback)}`
      ].join('\n'),
      context: { codingOperationId: c.work.operationId }
    }
  }
  async collect(): Promise<never> {
    throw conflict('CODING_NEW_ROUND_REQUIRED')
  }
}

@Injectable()
@Adapter('policy', refs.approval)
export class CodingReleasePolicy implements ProjectPipelinePolicyEvaluator {
  readonly kind = 'policy'
  readonly ref = refs.approval
  constructor(
    private readonly store: CodingDeliveryStore,
    private readonly evidence: CodingEvidenceService
  ) {}
  async evaluate() {
    return { status: 'blocked' as const, code: 'CODING_HUMAN_RELEASE_APPROVAL_REQUIRED' }
  }
  async authorizeDecision(
    c: ProjectPipelineOperationContext,
    input: Parameters<NonNullable<ProjectPipelinePolicyEvaluator['authorizeDecision']>>[1]
  ) {
    // Approval is exposed only in the host human gate, never through Agent middleware.
    const principal = RequestContext.currentApiPrincipal()
    const interactive =
      !principal ||
      (principal.principalType === 'client_secret' &&
        principal.clientSecretBindingType === SecretTokenBindingType.USER_XPERT &&
        principal.resourceScope?.kind === 'assistant')
    if (
      !interactive ||
      RequestContext.currentUser()?.type === UserType.COMMUNICATION ||
      RequestContext.currentUserId() !== c.actor.userId ||
      input.candidateSelectionKey !== 'coding_project.project_managers' ||
      !['approve', 'rework'].includes(input.outcome)
    )
      return false
    const access = await this.store.capabilities
      .require(ProjectAccessRuntimeCapability)
      .assertManage({ actor: c.actor, projectId: c.projectId })
    if (access.role === 'assistant') return false
    await this.store.current(c, c.subjects[0])
    const candidate = await this.evidence.input(c, 'candidate')
    return candidate.phase === 'development' && 'target' in candidate.releaseScope
  }
}

export const adapters = [
  CodingSubject,
  CodingSubjectSchema,
  CodingEvidenceSchema,
  CodingEvidenceResolver,
  CodingOperations,
  CodingDevelopmentOperation,
  CodingCurrentDevelopmentOperation,
  CodingDeploymentOperation,
  CodingCurrentDeploymentOperation,
  CodingGitOperation,
  CodingReworkOperation,
  CodingReleasePolicy
]
