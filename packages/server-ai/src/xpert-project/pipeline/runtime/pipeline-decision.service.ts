import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
    projectPipelineConfigurationSchema,
    projectPipelineDecisionSchema,
    type ProjectPipelineDecision
} from '@xpert-ai/contracts'
import {
    ProjectPipelineRuntimeAdapterRegistry,
    type ProjectPipelineContext,
    type ProjectPipelineOperationContext
} from '@xpert-ai/plugin-sdk'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineAttentionEntity,
    ProjectPipelineDecisionEntity,
    ProjectPipelineDefinitionEntity,
    ProjectPipelineEventEntity,
    ProjectPipelineInstanceEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineRunEntity
} from '../persistence/pipeline.entity'
import { pipelineIdentity, pipelineDigest } from '../persistence/pipeline-identity'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import { ProjectPipelineCoordinatorService } from './pipeline-coordinator.service'
import { ProjectPipelineEvidenceService } from './pipeline-evidence.service'
import { lockManagedProject, managedAudit } from './pipeline-transaction'
import { pipelineInputs } from './pipeline-inputs'
import { capturePipelineHumanWaitSnapshot } from '../persistence/pipeline-human-wait-snapshot'

/** Candidate/evidence adapters run outside the transaction; the exact gate/version is checked again before commit. */
@Injectable()
export class ProjectPipelineDecisionService {
    constructor(
        @InjectRepository(ProjectPipelineAttentionEntity)
        private readonly attentions: Repository<ProjectPipelineAttentionEntity>,
        private readonly access: ProjectAccessRuntimeService,
        private readonly adapters: ProjectPipelineRuntimeAdapterRegistry,
        private readonly evidence: ProjectPipelineEvidenceService,
        private readonly coordinator: ProjectPipelineCoordinatorService
    ) {}

    async decide(context: ProjectPipelineContext, request: ProjectPipelineDecision) {
        const input = projectPipelineDecisionSchema.parse(request)
        await this.access.assertEdit({ actor: context.actor, projectId: context.projectId })
        const scope = projectionScope(context),
            manager = this.attentions.manager
        const attention = await this.attentions.findOneByOrFail({ ...scope, id: input.attentionId })
        const node = await manager.findOneByOrFail(ProjectPipelineNodeEntity, {
            ...scope,
            id: attention.nodeInstanceId
        })
        const round = await manager.findOneByOrFail(ProjectPipelineRoundEntity, { ...scope, id: attention.roundId })
        const run = await manager.findOneByOrFail(ProjectPipelineRunEntity, { ...scope, id: round.runId })
        const definition = await manager.findOneByOrFail(ProjectPipelineDefinitionEntity, {
            ...scope,
            id: run.definitionId
        })
        const config = projectPipelineConfigurationSchema.parse({
            schemaVersion: 1,
            template: definition.definition,
            binding: run.bindingSnapshot
        })
        if (config.template.executionAuthority !== 'platform')
            throw pipelineProjectionConflict('PLATFORM_AUTHORITY_REQUIRED')
        const spec = config.template.nodes.find((item) => item.key === node.nodeKey)
        if (spec?.kind !== 'human_gate' || attention.kind !== 'human')
            throw pipelineProjectionConflict('HUMAN_GATE_REQUIRED')
        const operationId = pipelineIdentity(context, 'human-decision', attention.id, input.requestId)
        const saved: ProjectPipelineOperationContext = {
            ...context,
            idempotencyKey: operationId,
            work: {
                instanceId: attention.instanceId,
                runId: run.id,
                roundId: round.id,
                nodeInstanceId: node.id,
                operationId,
                inputDigest: round.inputDigest,
                generation: round.generation
            },
            subjects: round.subjectVersionSet,
            inputs: await pipelineInputs(manager, context, round, spec, config.binding),
            parameters: config.binding.parameters
        }
        const policy = this.adapters.resolve('policy', spec.policyRef, context.actor)
        const candidate = config.binding.roleBindings[spec.candidateRoleKey]
        if (
            !spec.outcomes.includes(input.outcome) ||
            candidate?.kind !== 'human' ||
            !policy.authorizeDecision ||
            !(await policy.authorizeDecision(saved, {
                candidateSelectionKey: candidate.selectionKey,
                outcome: input.outcome,
                evidence: input.evidence
            }))
        )
            throw pipelineProjectionConflict('DECISION_NOT_AUTHORIZED')
        for (const subject of saved.subjects)
            if (
                !(await this.adapters
                    .resolve('subject', subject.resolverRef, context.actor)
                    .checkCurrent(context, subject))
            )
                throw pipelineProjectionConflict('SUBJECT_SUPERSEDED')
        await this.evidence.inputs(saved)
        for (const ref of input.evidence) await this.evidence.verify(saved, ref)
        return manager.transaction(async (transaction) => {
            await lockManagedProject(transaction, context)
            const current = await transaction.findOneByOrFail(ProjectPipelineAttentionEntity, {
                ...scope,
                id: attention.id
            })
            const existing = await transaction.findOneBy(ProjectPipelineDecisionEntity, {
                ...scope,
                nodeInstanceId: node.id,
                generation: input.generation
            })
            if (existing) {
                if (
                    existing.operationId !== operationId ||
                    existing.actorId !== context.actor.userId ||
                    existing.outcome !== input.outcome ||
                    existing.inputDigest !== input.inputDigest ||
                    pipelineDigest(existing.evidence) !== pipelineDigest(input.evidence)
                )
                    throw pipelineProjectionConflict('DECISION_ALREADY_RECORDED')
                return { decisionId: existing.id }
            }
            const instance = await transaction.findOneByOrFail(ProjectPipelineInstanceEntity, {
                ...scope,
                id: attention.instanceId
            })
            const currentRound = await transaction.findOneByOrFail(ProjectPipelineRoundEntity, {
                ...scope,
                id: round.id
            })
            const currentNode = await transaction.findOneByOrFail(ProjectPipelineNodeEntity, { ...scope, id: node.id })
            if (
                instance.currentRoundId !== round.id ||
                currentRound.state !== 'active' ||
                current.state !== 'open' ||
                current.revision !== input.expectedRevision ||
                current.inputDigest !== input.inputDigest ||
                current.generation !== input.generation ||
                currentNode.projection.state.readiness !== 'ready' ||
                currentNode.projection.state.freshness !== 'current'
            )
                throw pipelineProjectionConflict('DECISION_VERSION_CONFLICT')
            const id = pipelineIdentity(context, 'decision', node.id, String(input.generation)),
                audit = managedAudit(context)
            await transaction.insert(ProjectPipelineDecisionEntity, {
                ...audit,
                id,
                nodeInstanceId: node.id,
                roundId: round.id,
                operationId,
                kind: 'human',
                policyRef: spec.policyRef,
                inputDigest: input.inputDigest,
                generation: input.generation,
                outcome: input.outcome,
                evidence: input.evidence,
                actorId: context.actor.userId
            })
            current.state = 'resolved'
            current.decisionId = id
            current.revision += 1
            await transaction.save(current)
            currentNode.projection = {
                ...currentNode.projection,
                evidence: input.evidence,
                state: { ...currentNode.projection.state, lifecycle: 'completed' }
            }
            await transaction.save(currentNode)
            instance.revision += 1
            await transaction.save(instance)
            await transaction.insert(ProjectPipelineEventEntity, {
                ...audit,
                id: pipelineIdentity(context, 'event', instance.id, String(instance.revision)),
                instanceId: instance.id,
                revision: instance.revision,
                type: 'decision.recorded',
                payload: {
                    roundId: round.id,
                    operationId,
                    humanWaitSnapshot: await capturePipelineHumanWaitSnapshot(transaction, context, instance.id)
                }
            })
            await this.coordinator.advanceWithinTransaction(transaction, context, instance.id)
            return { decisionId: id }
        })
    }
}
