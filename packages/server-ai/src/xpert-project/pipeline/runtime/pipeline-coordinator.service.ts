import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository, In, Not } from 'typeorm'
import { projectPipelineConfigurationSchema, type ProjectPipelineNodeDefinition } from '@xpert-ai/contracts'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { XpertProjectTask } from '../../entities/project-task.entity'
import { XpertProjectTaskExecution } from '../../entities/project-task-execution.entity'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineAttentionEntity,
    ProjectPipelineDecisionEntity,
    ProjectPipelineDefinitionEntity,
    ProjectPipelineEventEntity,
    ProjectPipelineInstanceEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineOperationEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineRunEntity
} from '../persistence/pipeline.entity'
import { pipelineDigest, pipelineIdentity } from '../persistence/pipeline-identity'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'
import { ProjectPipelineOperationStore } from './pipeline-operation.store'
import { planPipelineRound } from './pipeline-round-planner'
import { lockManagedProject, managedAudit } from './pipeline-transaction'
import { pipelineInputs } from './pipeline-inputs'
import { capturePipelineHumanWaitSnapshot } from '../persistence/pipeline-human-wait-snapshot'

/** Only explicit commands and durable observations call this reducer; reading the graph never advances it. */
@Injectable()
export class ProjectPipelineCoordinatorService {
    constructor(
        @InjectRepository(ProjectPipelineInstanceEntity)
        private readonly instances: Repository<ProjectPipelineInstanceEntity>,
        private readonly access: ProjectAccessRuntimeService,
        private readonly operations: ProjectPipelineOperationStore
    ) {}

    async advance(context: ProjectPipelineContext, instanceId: string) {
        await this.access.assertEdit({ actor: context.actor, projectId: context.projectId })
        return this.instances.manager.transaction(async (manager) => {
            await lockManagedProject(manager, context)
            return this.advanceWithinTransaction(manager, context, instanceId)
        })
    }

    async advanceWithinTransaction(manager: EntityManager, context: ProjectPipelineContext, instanceId: string) {
        if (!manager.queryRunner?.isTransactionActive) throw new Error('PIPELINE_COORDINATION_REQUIRES_TRANSACTION')
        const scope = projectionScope(context),
            audit = managedAudit(context)
        const instance = await manager.findOneByOrFail(ProjectPipelineInstanceEntity, { ...scope, id: instanceId })
        if (instance.authority !== 'platform') throw pipelineProjectionConflict('PLATFORM_AUTHORITY_REQUIRED')
        const round = await manager.findOneByOrFail(ProjectPipelineRoundEntity, {
            ...scope,
            id: instance.currentRoundId
        })
        const run = await manager.findOneByOrFail(ProjectPipelineRunEntity, { ...scope, id: instance.currentRunId })
        if (round.state !== 'active' || !['active', 'pending', 'waiting'].includes(run.state))
            return { queued: [] as string[], revision: instance.revision }
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
        const nodes = await manager.find(ProjectPipelineNodeEntity, {
            where: { ...scope, roundId: round.id, disposition: 'active' }
        })
        const decisions = await manager.find(ProjectPipelineDecisionEntity, {
            where: { ...scope, roundId: round.id, generation: round.generation, inputDigest: round.inputDigest }
        })
        const reservedExternalExecutions = await manager.count(ProjectPipelineOperationEntity, {
            where: {
                ...scope,
                instanceId,
                roundId: Not(round.id),
                kind: 'operation',
                state: In(['dispatching', 'pending', 'unknown'])
            }
        })
        const plan = planPipelineRound(
            config.template,
            Object.fromEntries(
                nodes.map((node) => [
                    node.nodeKey,
                    {
                        state: node.projection.state,
                        outcome: decisions.find((decision) => decision.nodeInstanceId === node.id)?.outcome
                    }
                ])
            ),
            {
                maxConcurrentExecutions: config.binding.limits!.maxConcurrentExecutions,
                reservedExternalExecutions: reservedExternalExecutions
                    ? config.binding.limits!.maxConcurrentExecutions
                    : 0
            }
        )
        let changed = false
        for (const node of nodes) {
            if (pipelineDigest(node.projection.state) !== pipelineDigest(plan.nodes[node.nodeKey].state)) {
                node.projection = { ...node.projection, state: plan.nodes[node.nodeKey].state }
                await manager.save(node)
                changed = true
            }
        }
        const queued: string[] = []
        const now = ((await manager.query('SELECT clock_timestamp() AS now')) as Array<{ now: Date }>)[0].now
        for (const action of plan.actions) {
            const node = nodes.find((item) => item.nodeKey === action.nodeKey)!
            const spec = config.template.nodes.find((item) => item.key === action.nodeKey)!
            if (action.kind === 'request_human' || action.kind === 'inspect') {
                changed =
                    (await this.attention(
                        manager,
                        context,
                        instanceId,
                        round,
                        node,
                        action.kind === 'inspect' ? 'unknown' : 'human',
                        spec
                    )) || changed
                continue
            }
            const previousAttempts = await manager.count(ProjectPipelineOperationEntity, {
                where: { ...scope, nodeInstanceId: node.id }
            })
            const limitCode =
                now.getTime() - run.createdAt.getTime() >= config.binding.limits!.runTimeoutMinutes * 60_000
                    ? 'RUN_TIME_LIMIT_EXCEEDED'
                    : previousAttempts >= config.binding.limits!.maxTechnicalAttemptsPerNode
                      ? 'ATTEMPT_LIMIT_EXCEEDED'
                      : null
            if (limitCode) {
                node.projection = { ...node.projection, state: { ...node.projection.state, readiness: 'blocked' } }
                await manager.save(node)
                await this.attention(manager, context, instanceId, round, node, 'blocked', undefined, limitCode)
                changed = true
                continue
            }
            const inputs = await pipelineInputs(manager, context, round, spec, config.binding)
            const operation = await this.operations.reserve(manager, context, {
                work: {
                    instanceId,
                    runId: run.id,
                    roundId: round.id,
                    nodeInstanceId: node.id,
                    inputDigest: round.inputDigest,
                    generation: round.generation
                },
                attempt: previousAttempts + 1,
                kind: spec.kind === 'work' ? 'operation' : spec.kind === 'router' ? 'policy' : 'subscription',
                handlerRef:
                    spec.kind === 'work'
                        ? spec.operationRef
                        : spec.kind === 'router'
                          ? spec.policyRef
                          : spec.kind === 'external_wait'
                            ? spec.subscriptionRef
                            : '',
                completionRef: spec.kind === 'work' ? spec.completionRef : null,
                inputs,
                parameters: config.binding.parameters,
                subjects: round.subjectVersionSet
            })
            node.projection = {
                ...node.projection,
                state: {
                    ...node.projection.state,
                    lifecycle: 'active',
                    runtime: spec.kind === 'work' ? 'queued' : 'none'
                }
            }
            await manager.save(node)
            if (spec.kind === 'work')
                for (const taskId of node.taskIds) {
                    await manager.insert(XpertProjectTaskExecution, {
                        ...audit,
                        id: pipelineIdentity(context, 'operation-attempt', operation.id, taskId),
                        taskId,
                        sourceKey: operation.id,
                        attempt: operation.attempt,
                        status: 'queued'
                    })
                }
            queued.push(operation.id)
            changed = true
        }
        for (const item of plan.blocked) {
            const node = nodes.find((node) => node.nodeKey === item.nodeKey)!
            const operation =
                item.code === 'REQUIRED_NODE_FAILED'
                    ? await manager.findOne(ProjectPipelineOperationEntity, {
                          where: { ...scope, nodeInstanceId: node.id, state: 'failed' },
                          order: { attempt: 'DESC' }
                      })
                    : null
            const code =
                operation?.receipt?.status === 'failed' && operation.receipt.code === 'MODEL_BUDGET_EXCEEDED'
                    ? operation.receipt.code
                    : item.code
            changed =
                (await this.attention(manager, context, instanceId, round, node, 'blocked', undefined, code)) || changed
        }
        for (const node of nodes)
            for (const taskId of node.taskIds) {
                const state = node.projection.state
                const status =
                    state.applicability === 'excluded'
                        ? 'todo'
                        : state.lifecycle === 'completed'
                          ? 'done'
                          : state.lifecycle === 'failed' || state.readiness === 'blocked'
                            ? 'blocked'
                            : state.lifecycle === 'active'
                              ? state.runtime === 'succeeded'
                                  ? 'review'
                                  : 'in_progress'
                              : 'todo'
                const task = await manager.findOneByOrFail(XpertProjectTask, {
                    ...scope,
                    id: taskId,
                    controlKind: 'pipeline',
                    pipelineInstanceId: instanceId
                })
                const disposition = state.applicability === 'excluded' ? 'excluded' : 'active'
                if (task.status !== status || task.pipelineDisposition !== disposition) {
                    task.status = status
                    task.pipelineDisposition = disposition
                    await manager.save(task)
                    changed = true
                }
            }
        const edges = plan.edges.map(({ applicability, ...edge }) => ({
            ...edge,
            key: JSON.stringify([edge.from, edge.to, edge.outcome ?? null]),
            selection: applicability
        }))
        if (pipelineDigest(edges) !== pipelineDigest(round.edges)) {
            round.edges = edges
            changed = true
        }
        if (plan.completed) {
            round.state = plan.awaitNewSubject ? 'awaiting_new_subject' : 'completed'
            run.state = plan.awaitNewSubject ? 'waiting' : 'completed'
            await manager.save(run)
            changed = true
        }
        if (changed) {
            await manager.save(round)
            instance.revision += 1
            await manager.save(instance)
            await manager.insert(ProjectPipelineEventEntity, {
                ...audit,
                id: pipelineIdentity(context, 'event', instanceId, String(instance.revision)),
                instanceId,
                revision: instance.revision,
                type: 'round.advanced',
                payload: {
                    roundId: round.id,
                    humanWaitSnapshot: await capturePipelineHumanWaitSnapshot(manager, context, instanceId)
                }
            })
        }
        return { queued, revision: instance.revision }
    }

    private async attention(
        manager: EntityManager,
        context: ProjectPipelineContext,
        instanceId: string,
        round: ProjectPipelineRoundEntity,
        node: ProjectPipelineNodeEntity,
        kind: ProjectPipelineAttentionEntity['kind'],
        spec?: ProjectPipelineNodeDefinition,
        reasonCode?: string
    ) {
        const id = pipelineIdentity(context, 'attention', node.id, kind)
        const previous = await manager.findOneBy(ProjectPipelineAttentionEntity, { ...projectionScope(context), id })
        if (previous) {
            if (previous.state !== 'resolved') return false
            await manager.update(
                ProjectPipelineAttentionEntity,
                { ...projectionScope(context), id },
                { state: 'open', revision: previous.revision + 1, reasonCode: reasonCode ?? previous.reasonCode }
            )
            return true
        }
        await manager.insert(ProjectPipelineAttentionEntity, {
            ...managedAudit(context),
            id,
            instanceId,
            nodeInstanceId: node.id,
            roundId: round.id,
            kind,
            state: 'open',
            revision: 1,
            inputDigest: round.inputDigest,
            generation: round.generation,
            reasonCode: reasonCode ?? (kind === 'human' ? 'HUMAN_DECISION_REQUIRED' : 'EXECUTION_CONFIRMATION_PENDING'),
            policyRef: spec?.kind === 'human_gate' ? spec.policyRef : null,
            candidateRoleKey: spec?.kind === 'human_gate' ? spec.candidateRoleKey : null,
            outcomes: spec?.kind === 'human_gate' ? spec.outcomes : [],
            decisionId: null
        })
        return true
    }
}
