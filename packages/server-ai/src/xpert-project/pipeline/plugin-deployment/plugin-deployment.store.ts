// Invariants: installation evidence is host-owned and immutable. A stale worker may
// observe an external effect, but cannot publish a receipt for a superseded round.
import { ConflictException, Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { z } from 'zod/v3'
import { t } from 'i18next'
import {
  projectPluginDeploymentReceiptSchema, projectPluginDeploymentRefs,
  type ProjectPipelineEvidenceRef, type ProjectPluginDeploymentReceipt
} from '@xpert-ai/contracts'
import type { ProjectPipelineContext, ProjectPipelineOperationContext } from '@xpert-ai/plugin-sdk'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
  ProjectPipelineDecisionEntity, ProjectPipelineEventEntity, ProjectPipelineInstanceEntity,
  ProjectPipelineNodeEntity, ProjectPipelineOperationEntity, ProjectPipelineRoundEntity, ProjectPipelineRunEntity
} from '../persistence/pipeline.entity'
import { pipelineDigest, pipelineIdentity } from '../persistence/pipeline-identity'
import { capturePipelineHumanWaitSnapshot } from '../persistence/pipeline-human-wait-snapshot'
import { lockManagedProject, managedAudit } from '../runtime/pipeline-transaction'
import { pipelineDecisionEvidence, PIPELINE_HUMAN_DECISION_SCHEMA, PIPELINE_DECISION_EVIDENCE } from '../runtime/pipeline-decision-evidence'

export function deploymentConflict() { return new ConflictException(t('server-ai:Error.PluginDeploymentApproval')) }

export function deploymentEvidence(id: string, value: ProjectPluginDeploymentReceipt): ProjectPipelineEvidenceRef {
  return { resolverRef: projectPluginDeploymentRefs.evidence, schemaRef: projectPluginDeploymentRefs.receipt,
    objectKey: id, version: '1', producerOperationId: value.operationId, digest: pipelineDigest(value) }
}

@Injectable()
export class ProjectPluginDeploymentStore {
  constructor(private readonly db: DataSource) {}

  async operation(c: ProjectPipelineContext, id: string, manager = this.db.manager) {
    const row = await manager.findOneByOrFail(ProjectPipelineOperationEntity, {
      ...projectionScope(c), id: z.string().uuid().parse(id)
    })
    if (row.kind !== 'operation' || row.handlerRef !== projectPluginDeploymentRefs.operation) throw deploymentConflict()
    return row
  }

  async current(c: ProjectPipelineContext, operation: ProjectPipelineOperationEntity, manager = this.db.manager) {
    const scope = projectionScope(c), w = operation.context.work
    const instance = await manager.findOneBy(ProjectPipelineInstanceEntity, { ...scope, id: w.instanceId })
    const run = await manager.findOneBy(ProjectPipelineRunEntity, { ...scope, id: w.runId, instanceId: w.instanceId })
    const round = await manager.findOneBy(ProjectPipelineRoundEntity, { ...scope, id: w.roundId, runId: w.runId })
    const node = await manager.findOneBy(ProjectPipelineNodeEntity, { ...scope, id: w.nodeInstanceId, roundId: w.roundId })
    if (instance?.authority !== 'platform' || instance.currentRunId !== w.runId || instance.currentRoundId !== w.roundId ||
      !run || !['pending', 'active', 'waiting'].includes(run.state) || round?.state !== 'active' ||
      round.generation !== w.generation || round.inputDigest !== w.inputDigest ||
      node?.disposition !== 'active' || node.projection.state.freshness !== 'current' ||
      node.projection.state.applicability !== 'selected' || operation.cancelRequestedAt ||
      !['dispatching', 'pending', 'unknown', 'succeeded', 'accepted'].includes(operation.state)) throw deploymentConflict()
  }

  async claim(c: ProjectPipelineOperationContext) {
    const row = await this.operation(c, c.work.operationId)
    // Resource reservations may be attached by the runner; compare the persisted inputs and identity directly.
    if (pipelineDigest({ ...c, actor: { ...c.actor }, work: { ...c.work }, resources: undefined }) !==
      pipelineDigest({ ...row.context, actor: { ...row.context.actor }, work: { ...row.context.work }, resources: undefined }) ||
      c.idempotencyKey !== row.id || !row.dispatchStartedAt || !row.leaseOwner ||
      !row.leaseExpiresAt || row.leaseExpiresAt.getTime() <= Date.now()) throw deploymentConflict()
    await this.current(c, row)
    return row
  }

  async approval(c: ProjectPipelineOperationContext, request: ProjectPipelineEvidenceRef) {
    const input = c.inputs.approval
    if (input?.kind !== 'evidence' || input.value.resolverRef !== PIPELINE_DECISION_EVIDENCE ||
      input.value.schemaRef !== PIPELINE_HUMAN_DECISION_SCHEMA) throw deploymentConflict()
    const decision = await this.db.manager.findOneByOrFail(ProjectPipelineDecisionEntity, {
      ...projectionScope(c), id: z.string().uuid().parse(input.value.objectKey)
    })
    if (pipelineDigest(pipelineDecisionEvidence(decision)) !== pipelineDigest(input.value) ||
      decision.kind !== 'human' || decision.outcome !== 'approve' || decision.roundId !== c.work.roundId ||
      decision.generation !== c.work.generation || decision.inputDigest !== c.work.inputDigest ||
      !decision.evidence.some((ref) => pipelineDigest(ref) === pipelineDigest(request))) throw deploymentConflict()
    return { reference: input.value, actorId: decision.actorId }
  }

  async record(c: ProjectPipelineOperationContext, claim: ProjectPipelineOperationEntity, value: ProjectPluginDeploymentReceipt) {
    const id = pipelineIdentity(c, 'plugin-deployment', claim.id)
    return this.db.transaction(async (manager) => {
      await lockManagedProject(manager, c)
      const row = await this.operation(c, claim.id, manager)
      await this.current(c, row, manager)
      if (row.leaseOwner !== claim.leaseOwner || row.leaseFence !== claim.leaseFence ||
        !row.leaseExpiresAt || row.leaseExpiresAt.getTime() <= Date.now()) throw deploymentConflict()
      const existing = await manager.findOneBy(ProjectPipelineEventEntity, { ...projectionScope(c), id })
      if (existing) return deploymentEvidence(id, projectPluginDeploymentReceiptSchema.parse(existing.payload.pluginDeployment))
      const instance = await manager.findOneByOrFail(ProjectPipelineInstanceEntity, { ...projectionScope(c), id: c.work.instanceId })
      instance.revision += 1
      await manager.save(instance)
      await manager.insert(ProjectPipelineEventEntity, { ...managedAudit(c), id, instanceId: instance.id,
        revision: instance.revision, type: 'operation.observed', payload: {
          roundId: c.work.roundId, operationId: claim.id, pluginDeployment: value,
          humanWaitSnapshot: await capturePipelineHumanWaitSnapshot(manager, c, instance.id)
        } })
      return deploymentEvidence(id, value)
    })
  }

  async read(c: ProjectPipelineContext, reference: ProjectPipelineEvidenceRef) {
    const row = await this.db.manager.findOneByOrFail(ProjectPipelineEventEntity, {
      ...projectionScope(c), id: z.string().uuid().parse(reference.objectKey)
    })
    const value = projectPluginDeploymentReceiptSchema.parse(row.payload.pluginDeployment)
    if (row.type !== 'operation.observed' || row.payload.operationId !== value.operationId ||
      row.id !== pipelineIdentity(c, 'plugin-deployment', value.operationId) ||
      pipelineDigest(deploymentEvidence(row.id, value)) !== pipelineDigest(reference)) throw deploymentConflict()
    return value
  }
}
