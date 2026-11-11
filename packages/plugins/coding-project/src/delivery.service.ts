import { Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { zodToJsonSchema } from 'zod-to-json-schema'
import {
  ArtifactsRuntimeCapability, ProjectFilesRuntimeCapability, ProjectPipelineCatalogRuntimeCapability,
  ProjectPipelineCommandsRuntimeCapability, ProjectPipelinesRuntimeCapability,
  type ProjectPipelineContext
} from '@xpert-ai/plugin-sdk'
import { CodingDeliveryStore, audit, scopeWhere, conflict } from './store'
import { CodingEvidenceService } from './evidence'
import { configuration as cliConfiguration, currentInstanceConfiguration } from './pipeline'
import { digest, identity, TYPE, deliveryBranch } from './constants'
import { developmentManifestSchema, deploymentManifestSchema, gitManifestSchema, requirementSchema } from './schemas'

@Injectable()
export class CodingDeliveryService {
  constructor(private readonly store: CodingDeliveryStore, private readonly evidence: CodingEvidenceService) {}

  async start(c: ProjectPipelineContext, conversationId: string, assistantId: string, input: {
    title: string; requirement: string; targetKey?: string; repositoryKey?: string; acceptedTaskId?: string
  }) {
    const access = await this.store.access(c)
    if (access.applicationKey !== TYPE.applicationKey || access.projectTypeKey !== TYPE.projectTypeKey)
      throw conflict('CODING_PROJECT_TYPE_REQUIRED')
    // A stage may repeat the entry instruction. Its persisted conversation owns one
    // existing delivery, including result-resumption turns with new execution IDs.
    const stage = await this.store.stageForConversation(c, conversationId)
    if (stage) {
      if (stage.context.executor.xpertId !== assistantId) throw conflict('CODING_EXECUTOR_SCOPE_MISMATCH')
      const current = await this.store.get(c, stage.deliveryId)
      return { deliveryId: current.id, instanceId: current.instanceId, operationId: stage.id,
        reused: true, alreadyExecutingStage: true,
        instruction: 'Continue this existing stage with coding_delivery_context. Do not start another Pipeline.' }
    }
    const allowed = await this.store.allowed(c)
    const target = input.targetKey ? allowed.targets.find((item) => item.key === input.targetKey)
      : allowed.targets.length === 1 ? allowed.targets[0] : null
    const repository = input.repositoryKey ? allowed.repositories.find((item) => item.key === input.repositoryKey)
      : allowed.repositories.length === 1 ? allowed.repositories[0] : null
    if (!target || !repository) throw conflict('CODING_CONFIGURE_AUTHORIZED_TARGET_AND_REPOSITORY')
    const source = input.acceptedTaskId
      ? await this.store.acceptedTask(c, input.acceptedTaskId) : null
    const proposed = requirementSchema.parse({ title: input.title, requirement: input.requirement, target, repository,
      ...(source ? { origin: { type: 'accepted_task', taskId: source.taskId, taskRevision: source.taskRevision,
        decisionId: source.decisionId, reviewExecutionId: source.review.executionId } } : {}) })
    const id = identity(c.projectId, conversationId, input.title)
    let row = await this.store.deliveries.findOneBy({ ...scopeWhere(c), id })
    if (!row) {
      const created = this.store.deliveries.create({ ...audit(c), id, createdById: c.actor.userId,
        revision: 1, requirement: proposed, instanceId: null, createdAt: new Date() })
      try { await this.store.deliveries.insert(created) } catch (error) {
        if (!(await this.store.deliveries.findOneBy({ ...scopeWhere(c), id }))) throw error
      }
      row = await this.store.get(c, id)
    }
    if (row.requirement.title !== proposed.title || row.requirement.requirement !== proposed.requirement ||
      row.requirement.target.key !== proposed.target.key || row.requirement.repository.key !== proposed.repository.key ||
      digest(row.requirement.origin ?? null) !== digest(proposed.origin ?? null))
      throw conflict('CODING_REQUIREMENT_CONFLICT')
    if (row.instanceId) return { deliveryId: id, instanceId: row.instanceId, reused: true }
    const api = this.store.capabilities.require(ProjectPipelineCommandsRuntimeCapability)
    const catalog = this.store.capabilities.require(ProjectPipelineCatalogRuntimeCapability)
    const configuration = row.requirement.target.deployment === 'current-instance' ? currentInstanceConfiguration : cliConfiguration
    const bindings = await catalog.bindings(c, { protocol: 3, limit: 100 })
    const existing = bindings.items.find((item) => item.configuration.binding.templateRef === configuration.binding.templateRef &&
      item.configuration.binding.executorBindings?.coordinator?.selectionKey === assistantId)
    const binding = existing ? { bindingId: existing.id } : await api.configure(c, {
      requestId: identity(c.projectId, assistantId, configuration.binding.templateRef),
      configuration: { ...configuration, binding: { ...configuration.binding,
        executorBindings: { ...configuration.binding.executorBindings,
          coordinator: { kind: 'assistant', roleKey: 'coordinator', selectionKey: assistantId } } } }
    })
    const receipt = await api.start(c, { bindingId: binding.bindingId, objectKey: id, triggerKey: id, title: input.title })
    await this.store.deliveries.update({ ...scopeWhere(c), id, revision: row.revision }, { instanceId: receipt.instanceId })
    return { deliveryId: id, ...receipt, reused: false }
  }

  async context(c: ProjectPipelineContext, operationId: string) {
    const work = await this.store.operation(c, operationId)
    const delivery = await this.store.get(c, work.deliveryId)
    const schema = work.phase === 'development' ? developmentManifestSchema
      : work.phase === 'deployment' ? deploymentManifestSchema : gitManifestSchema
    const candidate = work.phase === 'development' ? null : await this.evidence.input({ ...work.context, actor: c.actor }, 'candidate')
    return { deliveryId: delivery.id, revision: work.requirementVersion, requirement: work.requirement,
      phase: work.phase, work: work.context.work, submitted: work.evidence,
      deliveryBranch: deliveryBranch(delivery.id, work.requirementVersion),
      candidate, candidateDigest: candidate ? digest(candidate) : null,
      manifestSchema: zodToJsonSchema(schema),
      graph: delivery.instanceId ? await this.store.capabilities.require(ProjectPipelinesRuntimeCapability).graph(c, delivery.instanceId) : null }
  }

  async materialize(c: ProjectPipelineContext, operationId: string) {
    const work = await this.store.operation(c, operationId)
    await this.store.assertActive(work, 'submit', c)
    const candidate = await this.evidence.input({ ...work.context, actor: c.actor }, 'candidate')
    const artifacts = this.store.capabilities.require(ArtifactsRuntimeCapability)
    const files = this.store.capabilities.require(ProjectFilesRuntimeCapability)
    const output: Array<{ path: string; sha256: string }> = []
    for (const ref of candidate.artifacts) {
      const result = await artifacts.readArtifactVersion({ artifactId: ref.artifactId, artifactVersionId: ref.versionId, purpose: 'copy' })
      if (createHash('sha256').update(result.buffer).digest('hex') !== ref.sha256)
        throw conflict('CODING_ARTIFACT_DIGEST_CHANGED')
      const path = `.coding-delivery/${candidate.deliveryId}/${candidate.work.operationId}/${ref.fileName}`
      await files.mkdir({ ...c, path: `.coding-delivery/${candidate.deliveryId}/${candidate.work.operationId}` })
      try { await files.write({ ...c, path, buffer: result.buffer, expectedHash: null }) } catch (error) {
        const existing = await files.read({ ...c, path }).catch(() => null)
        if (existing?.sha256 !== ref.sha256) throw error
      }
      output.push({ path, sha256: ref.sha256 })
    }
    return output
  }

  async rework(c: ProjectPipelineContext, operationId: string, feedback: string) {
    const work = await this.store.operation(c, operationId)
    const row = await this.store.get(c, work.deliveryId)
    if (!row.instanceId) throw conflict('CODING_PIPELINE_NOT_STARTED')
    const access = await this.store.access(c)
    if (access.role === 'assistant' && row.createdById !== c.actor.userId)
      throw conflict('CODING_REWORK_REQUIRES_ORIGINAL_COORDINATOR')
    if (row.revision === work.requirementVersion) {
      await this.store.assertActive(work, 'rework', c)
      const allowed = await this.store.allowed(c)
      const target = allowed.targets.find((item) => item.key === row.requirement.target.key)
      const repository = allowed.repositories.find((item) => item.key === row.requirement.repository.key)
      if (!target || !repository) throw conflict('CODING_DESTINATION_NOT_AUTHORIZED')
      const result = await this.store.deliveries.update({ ...scopeWhere(c), id: row.id, revision: row.revision }, {
        revision: row.revision + 1, requirement: { ...row.requirement, target, repository, feedback }
      })
      if (result.affected !== 1) throw conflict('CODING_REVISION_CONFLICT')
    } else if (row.revision !== work.requirementVersion + 1 || row.requirement.feedback !== feedback)
      throw conflict('CODING_REWORK_STALE')
    const current = await this.store.get(c, row.id)
    const graph = await this.store.capabilities.require(ProjectPipelinesRuntimeCapability).graph(c, row.instanceId)
    return this.store.capabilities.require(ProjectPipelineCommandsRuntimeCapability).nextRound(c, {
      instanceId: row.instanceId, requestId: identity(row.id, 'rework', String(current.revision)),
      expectedRevision: graph.instance.revision
    })
  }
}
