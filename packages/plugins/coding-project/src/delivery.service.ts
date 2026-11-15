import { Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { zodToJsonSchema } from 'zod-to-json-schema'
import {
  ArtifactsRuntimeCapability,
  ProjectFilesRuntimeCapability,
  ProjectPipelineCatalogRuntimeCapability,
  ProjectPipelineCommandsRuntimeCapability,
  ProjectPipelinesRuntimeCapability,
  type ProjectPipelineContext
} from '@xpert-ai/plugin-sdk'
import { CodingDeliveryStore, audit, scopeWhere, conflict } from './store'
import { CodingEvidenceService } from './evidence'
import { configuration as cliConfiguration, currentInstanceConfiguration, localConfiguration } from './pipeline'
import { digest, identity, TYPE, deliveryBranch } from './constants'
import {
  developmentManifestSchema,
  deploymentManifestSchema,
  gitManifestSchema,
  requirementSchema,
  type DeliveryMode
} from './schemas'

const pipelineHandoff = {
  nextAction: 'finish_coordination_turn' as const,
  instruction:
    'The platform has dispatched the stage in its own conversation. Report these Pipeline identifiers and finish this turn. Do not create or dispatch tasks, adopt the stage operation, poll or wait here; the assigned stage Assistant owns implementation and review.'
}

@Injectable()
export class CodingDeliveryService {
  constructor(
    private readonly store: CodingDeliveryStore,
    private readonly evidence: CodingEvidenceService
  ) {}

  async start(
    c: ProjectPipelineContext,
    conversationId: string,
    assistantId: string,
    input: {
      title: string
      requirement: string
      mode?: DeliveryMode
      targetKey?: string
      repositoryKey?: string
      acceptedTaskId?: string
    }
  ) {
    const access = await this.store.access(c)
    if (access.applicationKey !== TYPE.applicationKey || access.projectTypeKey !== TYPE.projectTypeKey)
      throw conflict('CODING_PROJECT_TYPE_REQUIRED')
    // A stage may repeat the entry instruction. Its persisted conversation owns one
    // existing delivery, including result-resumption turns with new execution IDs.
    const stage = await this.store.stageForConversation(c, conversationId)
    if (stage) {
      if (stage.context.executor.xpertId !== assistantId) throw conflict('CODING_EXECUTOR_SCOPE_MISMATCH')
      const current = await this.store.get(c, stage.deliveryId)
      return {
        deliveryId: current.id,
        instanceId: current.instanceId,
        operationId: stage.id,
        reused: true,
        alreadyExecutingStage: true,
        nextAction: 'continue_stage' as const,
        instruction: 'Continue this existing stage with coding_delivery_context. Do not start another Pipeline.'
      }
    }
    const id = identity(c.projectId, conversationId, input.title)
    let row = await this.store.deliveries.findOneBy({ ...scopeWhere(c), id })
    if (row) row.requirement = requirementSchema.parse(row.requirement)
    const mode =
      input.mode ?? (row ? (row.requirement.mode ?? 'release') : await this.store.deliveryMode(c, assistantId))
    const pinned = row?.requirement.mode !== 'local' ? row?.requirement : undefined
    const preflight = await this.preflight(c, assistantId, {
      mode,
      targetKey: input.targetKey ?? pinned?.target.key,
      repositoryKey: input.repositoryKey ?? pinned?.repository.key
    })
    if (!preflight.ready) throw conflict(preflight.blockers[0])
    const destination =
      mode === 'local'
        ? { mode: 'local' as const }
        : {
            ...(row && row.requirement.mode === undefined ? {} : { mode: 'release' as const }),
            target: preflight.targets.find((item) => item.key === preflight.targetKey),
            repository: preflight.repositories.find((item) => item.key === preflight.repositoryKey)
          }
    const source = input.acceptedTaskId ? await this.store.acceptedTask(c, input.acceptedTaskId) : null
    const proposed = requirementSchema.parse({
      title: input.title,
      requirement: input.requirement,
      ...destination,
      ...(source
        ? {
            origin: {
              type: 'accepted_task',
              taskId: source.taskId,
              taskRevision: source.taskRevision,
              decisionId: source.decisionId,
              reviewExecutionId: source.review.executionId
            }
          }
        : {})
    })
    if (!row) {
      const created = this.store.deliveries.create({
        ...audit(c),
        id,
        createdById: c.actor.userId,
        revision: 1,
        requirement: proposed,
        instanceId: null,
        createdAt: new Date()
      })
      try {
        await this.store.deliveries.insert(created)
      } catch (error) {
        if (!(await this.store.deliveries.findOneBy({ ...scopeWhere(c), id }))) throw error
      }
      row = await this.store.get(c, id)
    }
    if (
      row.requirement.title !== proposed.title ||
      row.requirement.requirement !== proposed.requirement ||
      (row.requirement.mode ?? 'release') !== (proposed.mode ?? 'release') ||
      (row.requirement.mode !== 'local' &&
        proposed.mode !== 'local' &&
        (row.requirement.target.key !== proposed.target.key ||
          row.requirement.repository.key !== proposed.repository.key)) ||
      digest(row.requirement.origin ?? null) !== digest(proposed.origin ?? null)
    )
      throw conflict('CODING_REQUIREMENT_CONFLICT')
    await this.store.authorizeRequirement(c, row.requirement)
    if (row.instanceId) return { deliveryId: id, instanceId: row.instanceId, reused: true, ...pipelineHandoff }
    const api = this.store.capabilities.require(ProjectPipelineCommandsRuntimeCapability)
    const catalog = this.store.capabilities.require(ProjectPipelineCatalogRuntimeCapability)
    const configuration =
      row.requirement.mode === 'local'
        ? localConfiguration
        : row.requirement.target.deployment === 'current-instance'
          ? currentInstanceConfiguration
          : cliConfiguration
    const bindings = await catalog.bindings(c, { protocol: 3, limit: 100 })
    const existing = bindings.items.find(
      (item) =>
        item.configuration.binding.templateRef === configuration.binding.templateRef &&
        item.configuration.binding.executorBindings?.coordinator?.selectionKey === assistantId
    )
    const binding = existing
      ? { bindingId: existing.id }
      : await api.configure(c, {
          requestId: identity(c.projectId, assistantId, configuration.binding.templateRef),
          configuration: {
            ...configuration,
            binding: {
              ...configuration.binding,
              executorBindings: {
                ...configuration.binding.executorBindings,
                coordinator: { kind: 'assistant', roleKey: 'coordinator', selectionKey: assistantId }
              }
            }
          }
        })
    const receipt = await api.start(c, {
      bindingId: binding.bindingId,
      objectKey: id,
      triggerKey: id,
      title: input.title
    })
    await this.store.deliveries.update(
      { ...scopeWhere(c), id, revision: row.revision },
      { instanceId: receipt.instanceId }
    )
    return { deliveryId: id, ...receipt, reused: false, ...pipelineHandoff }
  }

  async preflight(
    c: ProjectPipelineContext,
    assistantId: string,
    input: { mode?: DeliveryMode; targetKey?: string; repositoryKey?: string } = {}
  ) {
    const access = await this.store.access(c)
    const mode = input.mode ?? (await this.store.deliveryMode(c, assistantId))
    const allowed = mode === 'local' ? { targets: [], repositories: [] } : await this.store.allowed(c)
    const target = input.targetKey
      ? allowed.targets.find((item) => item.key === input.targetKey)
      : allowed.targets.length === 1
        ? allowed.targets[0]
        : null
    const repository = input.repositoryKey
      ? allowed.repositories.find((item) => item.key === input.repositoryKey)
      : allowed.repositories.length === 1
        ? allowed.repositories[0]
        : null
    const blockers: string[] = []
    if (access.applicationKey !== TYPE.applicationKey || access.projectTypeKey !== TYPE.projectTypeKey)
      blockers.push('CODING_PROJECT_TYPE_REQUIRED')
    if (mode === 'local' && (input.targetKey || input.repositoryKey))
      blockers.push('CODING_LOCAL_SCOPE_HAS_EXTERNAL_DESTINATION')
    if (mode === 'release') {
      if (!allowed.targets.length || !allowed.repositories.length)
        blockers.push('CODING_CONFIGURE_AUTHORIZED_TARGET_AND_REPOSITORY')
      else if ((input.targetKey && !target) || (input.repositoryKey && !repository))
        blockers.push('CODING_DESTINATION_NOT_AUTHORIZED')
      else if (!target || !repository) blockers.push('CODING_DESTINATION_SELECTION_REQUIRED')
    }
    return {
      mode,
      ready: blockers.length === 0,
      blockers,
      ...allowed,
      targetKey: target?.key,
      repositoryKey: repository?.key,
      scope: mode === 'local' ? 'computer_isolated_environment' : 'authorized_release_destinations'
    }
  }

  async context(c: ProjectPipelineContext, operationId: string) {
    const work = await this.store.operation(c, operationId)
    const delivery = await this.store.get(c, work.deliveryId)
    const schema =
      work.phase === 'development'
        ? developmentManifestSchema
        : work.phase === 'deployment'
          ? deploymentManifestSchema
          : gitManifestSchema
    const candidate =
      work.phase === 'development' ? null : await this.evidence.input({ ...work.context, actor: c.actor }, 'candidate')
    return {
      deliveryId: delivery.id,
      revision: work.requirementVersion,
      requirement: work.requirement,
      phase: work.phase,
      work: work.context.work,
      submitted: work.evidence,
      deliveryBranch: deliveryBranch(delivery.id, work.requirementVersion),
      candidate,
      candidateDigest: candidate ? digest(candidate) : null,
      manifestSchema: zodToJsonSchema(schema),
      graph: delivery.instanceId
        ? await this.store.capabilities.require(ProjectPipelinesRuntimeCapability).graph(c, delivery.instanceId)
        : null
    }
  }

  async materialize(c: ProjectPipelineContext, operationId: string) {
    const work = await this.store.operation(c, operationId)
    await this.store.assertActive(work, 'submit', c)
    const candidate = await this.evidence.input({ ...work.context, actor: c.actor }, 'candidate')
    const artifacts = this.store.capabilities.require(ArtifactsRuntimeCapability)
    const files = this.store.capabilities.require(ProjectFilesRuntimeCapability)
    const output: Array<{ path: string; sha256: string }> = []
    for (const ref of candidate.artifacts) {
      const result = await artifacts.readArtifactVersion({
        artifactId: ref.artifactId,
        artifactVersionId: ref.versionId,
        purpose: 'copy'
      })
      if (createHash('sha256').update(result.buffer).digest('hex') !== ref.sha256)
        throw conflict('CODING_ARTIFACT_DIGEST_CHANGED')
      const path = `.coding-delivery/${candidate.deliveryId}/${candidate.work.operationId}/${ref.fileName}`
      await files.mkdir({ ...c, path: `.coding-delivery/${candidate.deliveryId}/${candidate.work.operationId}` })
      try {
        await files.write({ ...c, path, buffer: result.buffer, expectedHash: null })
      } catch (error) {
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
      let requirement = row.requirement
      if (requirement.mode !== 'local') {
        const allowed = await this.store.allowed(c)
        const { target: previousTarget, repository: previousRepository } = requirement
        const target = allowed.targets.find((item) => item.key === previousTarget.key)
        const repository = allowed.repositories.find((item) => item.key === previousRepository.key)
        if (!target || !repository) throw conflict('CODING_DESTINATION_NOT_AUTHORIZED')
        requirement = { ...requirement, target, repository }
      }
      const result = await this.store.deliveries.update(
        { ...scopeWhere(c), id: row.id, revision: row.revision },
        {
          revision: row.revision + 1,
          requirement: { ...requirement, feedback }
        }
      )
      if (result.affected !== 1) throw conflict('CODING_REVISION_CONFLICT')
    } else if (row.revision !== work.requirementVersion + 1 || row.requirement.feedback !== feedback)
      throw conflict('CODING_REWORK_STALE')
    const current = await this.store.get(c, row.id)
    const graph = await this.store.capabilities.require(ProjectPipelinesRuntimeCapability).graph(c, row.instanceId)
    return this.store.capabilities.require(ProjectPipelineCommandsRuntimeCapability).nextRound(c, {
      instanceId: row.instanceId,
      requestId: identity(row.id, 'rework', String(current.revision)),
      expectedRevision: graph.instance.revision
    })
  }
}
