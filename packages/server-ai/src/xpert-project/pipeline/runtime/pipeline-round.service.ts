import { assertPipelineDispatchEnabled } from './pipeline-dispatch-policy'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import {
    projectPipelineNextRoundSchema,
    projectPipelineSubjectVersionSchema,
    type ProjectPipelineNextRound
} from '@xpert-ai/contracts'
import { ProjectPipelineRuntimeAdapterRegistry, type ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { XpertProjectTask } from '../../entities/project-task.entity'
import {
    ProjectPipelineAttentionEntity,
    ProjectPipelineDefinitionEntity,
    ProjectPipelineInstanceEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineOperationEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineRunEntity
} from '../persistence/pipeline.entity'
import { pipelineDigest, pipelineIdentity } from '../persistence/pipeline-identity'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import { ProjectPipelineCoordinatorService } from './pipeline-coordinator.service'
import { initializeManagedPipelineNodes } from './pipeline-managed-nodes'
import { lockManagedProject, managedAudit } from './pipeline-transaction'

/** A new input creates a new immutable round. Previously dispatched work remains inspectable until confirmed terminal. */
@Injectable()
export class ProjectPipelineRoundService {
    constructor(
        @InjectRepository(ProjectPipelineInstanceEntity)
        private readonly instances: Repository<ProjectPipelineInstanceEntity>,
        private readonly access: ProjectAccessRuntimeService,
        private readonly adapters: ProjectPipelineRuntimeAdapterRegistry,
        private readonly coordinator: ProjectPipelineCoordinatorService
    ) {}

    async next(context: ProjectPipelineContext, request: ProjectPipelineNextRound) {
        const input = projectPipelineNextRoundSchema.parse(request)
        await this.access.assertEdit({ actor: context.actor, projectId: context.projectId })
        const scope = projectionScope(context),
            manager = this.instances.manager
        const instance = await this.instances.findOneByOrFail({ ...scope, id: input.instanceId })
        if (instance.authority !== 'platform') throw pipelineProjectionConflict('PLATFORM_AUTHORITY_REQUIRED')
        const run = await manager.findOneByOrFail(ProjectPipelineRunEntity, { ...scope, id: instance.currentRunId })
        const roundId = pipelineIdentity(context, 'round', run.id, input.requestId)
        const existing = await manager.findOneBy(ProjectPipelineRoundEntity, { ...scope, id: roundId })
        if (existing) return { instanceId: instance.id, runId: run.id, roundId, revision: instance.revision }
        const definition = await manager.findOneByOrFail(ProjectPipelineDefinitionEntity, {
            ...scope,
            id: run.definitionId
        })
        const template = definition.definition
        if (template.executionAuthority !== 'platform') throw pipelineProjectionConflict('PLATFORM_AUTHORITY_REQUIRED')
        const resolver = this.adapters.resolve('subject', template.subjectResolverRef, context.actor)
        const subject = projectPipelineSubjectVersionSchema.parse(
            await resolver.resolve(context, instance.subject.objectKey)
        )
        if (
            subject.resolverRef !== template.subjectResolverRef ||
            subject.objectKey !== instance.subject.objectKey ||
            !(await resolver.checkCurrent(context, subject))
        )
            throw pipelineProjectionConflict('SUBJECT_SUPERSEDED')
        const digest = pipelineDigest([subject])
        return manager.transaction(async (transaction) => {
            await lockManagedProject(transaction, context)
            const current = await transaction.findOneByOrFail(ProjectPipelineInstanceEntity, {
                ...scope,
                id: instance.id
            })
            const replay = await transaction.findOneBy(ProjectPipelineRoundEntity, { ...scope, id: roundId })
            if (replay) return { instanceId: current.id, runId: run.id, roundId, revision: current.revision }
            assertPipelineDispatchEnabled()
            if (current.revision !== input.expectedRevision || current.currentRunId !== run.id)
                throw pipelineProjectionConflict('ROUND_REVISION_CONFLICT')
            const currentRun = await transaction.findOneByOrFail(ProjectPipelineRunEntity, { ...scope, id: run.id })
            const previous = await transaction.findOneByOrFail(ProjectPipelineRoundEntity, {
                ...scope,
                id: current.currentRoundId
            })
            if (
                !['active', 'waiting'].includes(currentRun.state) ||
                !['active', 'awaiting_new_subject'].includes(previous.state)
            )
                throw pipelineProjectionConflict('ROUND_STATE_CONFLICT')
            if (previous.inputDigest === digest) throw pipelineProjectionConflict('NEW_SUBJECT_VERSION_REQUIRED')
            const rounds = await transaction
                .createQueryBuilder(ProjectPipelineRoundEntity, 'round')
                .innerJoin(ProjectPipelineRunEntity, 'run', 'run.id = round."runId"')
                .where('run."instanceId" = :id AND run."projectId" = :projectId', {
                    id: instance.id,
                    projectId: context.projectId
                })
                .getCount()
            if (rounds >= template.roundPolicy.maxRounds) throw pipelineProjectionConflict('ROUND_LIMIT_EXCEEDED')
            if (previous.state === 'active') {
                previous.state = 'superseded'
                await transaction.save(previous)
            }
            const oldNodes = await transaction.find(ProjectPipelineNodeEntity, {
                where: { ...scope, roundId: previous.id }
            })
            for (const node of oldNodes) {
                node.disposition = 'superseded'
                node.projection = {
                    ...node.projection,
                    state: { ...node.projection.state, freshness: 'superseded', readiness: 'blocked' }
                }
                await transaction.save(node)
                if (node.taskIds.length)
                    await transaction.update(
                        XpertProjectTask,
                        { ...scope, id: In(node.taskIds) },
                        { pipelineDisposition: 'superseded' }
                    )
            }
            await transaction.update(
                ProjectPipelineAttentionEntity,
                { ...scope, roundId: previous.id, state: 'open' },
                { state: 'superseded' }
            )
            await transaction.update(
                ProjectPipelineOperationEntity,
                { ...scope, roundId: previous.id, state: 'queued' },
                { state: 'superseded' }
            )
            await transaction.insert(ProjectPipelineRoundEntity, {
                ...managedAudit(context),
                id: roundId,
                runId: run.id,
                sourceKey: input.requestId,
                sequence: previous.sequence + 1,
                generation: rounds + 1,
                inputDigest: digest,
                subjectVersionSet: [subject],
                state: 'active',
                edges: []
            })
            current.currentRoundId = roundId
            await transaction.save(current)
            currentRun.state = 'active'
            await transaction.save(currentRun)
            await initializeManagedPipelineNodes(
                transaction,
                context,
                current.id,
                roundId,
                template,
                currentRun.bindingSnapshot
            )
            const planned = await this.coordinator.advanceWithinTransaction(transaction, context, current.id)
            return { instanceId: current.id, runId: run.id, roundId, revision: planned.revision }
        })
    }
}
