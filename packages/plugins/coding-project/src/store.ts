// Invariants: requirement revisions never change in place. An operation can seal one
// immutable evidence record; retries may only reuse that same record.
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import {
  ProjectAccessRuntimeCapability, ProjectPipelinesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  ProjectTasksRuntimeCapability,
  type ProjectPipelineContext, type ProjectPipelineAssistantContext, type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import type { ProjectPipelineSubjectVersion } from '@xpert-ai/contracts'
import { CodingDelivery, CodingDeliveryWork } from './entities'
import { CONFIG_READER, requirementSchema, evidenceSchema, storedContextSchema, type ConfigReader, type Requirement, type Phase } from './schemas'
import { canonical, digest, refs } from './constants'
import { codingError } from './errors'

export const scopeWhere = (c: ProjectPipelineContext) => ({
  tenantId: c.actor.tenantId, organizationId: c.actor.organizationId ?? IsNull(), projectId: c.projectId
})
export const audit = (c: ProjectPipelineContext) => ({
  tenantId: c.actor.tenantId, organizationId: c.actor.organizationId ?? null, projectId: c.projectId
})
export const conflict = (code: string) => new ConflictException(codingError(code))

@Injectable()
export class CodingDeliveryStore {
  constructor(
    @InjectRepository(CodingDelivery) readonly deliveries: Repository<CodingDelivery>,
    @InjectRepository(CodingDeliveryWork) readonly works: Repository<CodingDeliveryWork>,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) readonly capabilities: RuntimeCapabilityRegistry,
    @Inject(CONFIG_READER) readonly readConfig: ConfigReader
  ) {}

  async access(c: ProjectPipelineContext) {
    return this.capabilities.require(ProjectAccessRuntimeCapability).assertEdit({ actor: c.actor, projectId: c.projectId })
  }
  async acceptedTask(c: ProjectPipelineContext, taskId: string) {
    const accepted = await this.capabilities.require(ProjectTasksRuntimeCapability).readAcceptance({ actor: c.actor, projectId: c.projectId }, taskId)
    if (!accepted) throw conflict('CODING_FORMAL_ACCEPTANCE_NOT_SUBMITTED')
    if (accepted.projectId !== c.projectId || accepted.taskId !== taskId) throw conflict('CODING_ARTIFACT_SCOPE_MISMATCH')
    if (!accepted.review || accepted.review.mode !== 'execution' || accepted.review.verdict !== 'pass')
      throw conflict('CODING_EXECUTION_REVIEW_REQUIRED')
    return { ...accepted, review: accepted.review }
  }
  async get(c: ProjectPipelineContext, id: string) {
    await this.access(c)
    const row = await this.deliveries.findOneBy({ ...scopeWhere(c), id })
    if (!row) throw new NotFoundException(codingError('CODING_DELIVERY_NOT_FOUND'))
    row.requirement = requirementSchema.parse(row.requirement)
    return row
  }
  async allowed(c: ProjectPipelineContext) {
    await this.access(c)
    const config = await this.readConfig()
    return {
      targets: config.targets.filter((item) => item.projectIds.includes(c.projectId))
        .map((item) => ({ ...item, projectIds: [c.projectId] })),
      repositories: config.repositories.filter((item) => item.projectIds.includes(c.projectId))
        .map((item) => ({ ...item, projectIds: [c.projectId] }))
    }
  }
  async authorizeRequirement(c: ProjectPipelineContext, requirement: Requirement) {
    const config = await this.allowed(c)
    const target = config.targets.find((item) => item.key === requirement.target.key)
    const repository = config.repositories.find((item) => item.key === requirement.repository.key)
    if (!target || !repository) throw new ForbiddenException(codingError('CODING_DESTINATION_NOT_AUTHORIZED'))
    if (canonical(target) !== canonical(requirement.target) || canonical(repository) !== canonical(requirement.repository))
      throw conflict('CODING_DESTINATION_CHANGED_NEW_ROUND_REQUIRED')
    if (requirement.origin) {
      const origin = requirement.origin
      const accepted = await this.acceptedTask(c, origin.taskId)
      if (accepted.taskId !== origin.taskId || accepted.taskRevision !== origin.taskRevision ||
        accepted.decisionId !== origin.decisionId || accepted.review.executionId !== origin.reviewExecutionId)
        throw conflict('CODING_SOURCE_ACCEPTANCE_CHANGED')
    }
  }
  version(row: CodingDelivery): ProjectPipelineSubjectVersion {
    return { resolverRef: refs.subject, objectKey: row.id, version: String(row.revision),
      digest: digest({ projectId: row.projectId, id: row.id, revision: row.revision, requirement: row.requirement }) }
  }
  async current(c: ProjectPipelineContext, subject: ProjectPipelineSubjectVersion) {
    const row = await this.get(c, subject.objectKey)
    await this.authorizeRequirement(c, row.requirement)
    if (canonical(this.version(row)) !== canonical(subject)) throw conflict('CODING_REQUIREMENT_SUPERSEDED')
    return row
  }
  async operation(c: ProjectPipelineContext, id: string) {
    await this.access(c)
    const row = await this.works.findOneBy({ ...scopeWhere(c), id })
    if (!row) throw new NotFoundException(codingError('CODING_OPERATION_NOT_FOUND'))
    return { ...row, context: storedContextSchema.parse(row.context),
      requirement: requirementSchema.parse(row.requirement), evidence: row.evidence ? evidenceSchema.parse(row.evidence) : null }
  }
  async stageForConversation(c: ProjectPipelineContext, conversationId: string) {
    await this.access(c)
    const rows = await this.works.find({ where: scopeWhere(c),
      select: ['id', 'deliveryId', 'context'], order: { createdAt: 'DESC' } })
    for (const row of rows) {
      const context = storedContextSchema.parse(row.context)
      if (context.executor.conversationId === conversationId) return { ...row, context }
    }
    return null
  }
  async begin(c: ProjectPipelineAssistantContext, phase: Phase) {
    if (c.subjects.length !== 1) throw conflict('CODING_REQUIREMENT_REQUIRED')
    const delivery = await this.current(c, c.subjects[0])
    const existing = await this.works.findOneBy({ ...scopeWhere(c), id: c.work.operationId })
    if (existing) {
      const context = storedContextSchema.parse(existing.context)
      if (existing.phase !== phase || existing.deliveryId !== delivery.id ||
        canonical(context.work) !== canonical(c.work) ||
        context.executor.conversationId !== c.executor.conversationId)
        throw conflict('CODING_OPERATION_IDENTITY_CONFLICT')
      return existing
    }
    const row = this.works.create({ ...audit(c), id: c.work.operationId, deliveryId: delivery.id,
      requirementVersion: delivery.revision, requirement: delivery.requirement, phase, context: c, evidence: null, createdAt: new Date() })
    try { await this.works.insert(row) } catch (error) {
      const replay = await this.works.findOneBy({ ...scopeWhere(c), id: row.id })
      if (!replay) throw error
      return this.begin(c, phase)
    }
    return row
  }
  async assertActive(row: Awaited<ReturnType<CodingDeliveryStore['operation']>>, purpose: 'submit' | 'rework' = 'submit',
    caller: ProjectPipelineContext = row.context) {
    const c = { ...row.context, actor: caller.actor }
    if (purpose === 'submit') await this.current(c, c.subjects[0])
    else {
      const current = await this.get(c, row.deliveryId)
      if (canonical(this.version(current)) !== canonical(c.subjects[0])) throw conflict('CODING_REQUIREMENT_SUPERSEDED')
    }
    const graph = await this.capabilities.require(ProjectPipelinesRuntimeCapability).graph(c, c.work.instanceId)
    const node = graph.nodes.find((item) => item.id === c.work.nodeInstanceId)
    if (graph.roundId !== c.work.roundId || graph.round.inputDigest !== c.work.inputDigest ||
      graph.round.generation !== c.work.generation || !['active', 'waiting'].includes(graph.runState) ||
      node?.projection.state.freshness !== 'current' ||
      (purpose === 'submit' && ['completed', 'failed', 'cancelled'].includes(node.projection.state.lifecycle)))
      throw conflict('CODING_OPERATION_NOT_ACTIVE')
  }
}
