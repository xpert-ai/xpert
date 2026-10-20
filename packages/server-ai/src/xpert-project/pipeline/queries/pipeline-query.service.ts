// Invariants: historical business state is immutable; runtime observations may finish later.
// Merge observations only through persisted node/round ownership, never shared task identity alone.
import { observePipelineNodes } from './pipeline-node-observations'
import { attributePipelineExecutions } from './pipeline-execution-attribution'
import { pipelineExecutionOwners } from './pipeline-execution-owners'
import { pipelineDispatchEnabled } from '../runtime/pipeline-dispatch-policy'
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MoreThan, Repository } from 'typeorm'
import { z } from 'zod/v3'
import { t } from 'i18next'
import {
    projectPipelineDefinitionSchema,
    projectPipelineProjectionEdgeSchema,
    projectPipelineProjectionNodeSchema,
    projectPipelineStatistics,
    selectedPipelineAttemptFacts,
    type ProjectPipelineGraph,
    type ProjectPipelineSummary
} from '@xpert-ai/contracts'
import {
    RequestContext,
    ProjectPipelineContributionRegistry,
    ProjectPipelinesRuntimeCapability,
    type ProjectPipelineContext,
    type ProjectPipelinesApi
} from '@xpert-ai/plugin-sdk'
import { RuntimeCapabilityProvider } from '../../../shared/runtime/runtime-capability-provider.decorator'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { ProjectTaskGraphService } from '../../services/project-task-graph.service'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineDefinitionEntity,
    ProjectPipelineInstanceEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineRefreshEntity,
    ProjectPipelineAttentionEntity,
    ProjectPipelineRunEntity,
    ProjectPipelineOperationEntity
} from '../persistence/pipeline.entity'
import { ProjectPipelineProjectionService } from '../projection/pipeline-projection.service'
import { pipelineDigest } from '../persistence/pipeline-identity'
import { providerHistoryTasks, observeHistoricalPipelineTasks } from './pipeline-history'
import { pipelineInputs } from '../runtime/pipeline-inputs'
import { pipelineRetryReason } from '../runtime/pipeline-retry'
import { readPipelineModelUsage } from './pipeline-model-usage'
import { providerActionAttentions } from './pipeline-provider-attentions'

@Injectable()
@RuntimeCapabilityProvider(ProjectPipelinesRuntimeCapability)
export class ProjectPipelineQueryService implements ProjectPipelinesApi {
    constructor(
        @InjectRepository(ProjectPipelineInstanceEntity)
        private readonly instances: Repository<ProjectPipelineInstanceEntity>,
        private readonly access: ProjectAccessRuntimeService,
        private readonly taskGraph: ProjectTaskGraphService,
        private readonly projection: ProjectPipelineProjectionService,
        private readonly catalog: ProjectPipelineContributionRegistry
    ) {}

    private async assertRead(context: ProjectPipelineContext) {
        const readable = await this.access.listReadable({ actor: context.actor, projectIds: [context.projectId] })
        if (!readable.length) throw new ForbiddenException(t('server-ai:Error.ProjectTaskAccessDenied'))
        return readable[0]
    }

    async list(context: ProjectPipelineContext, input: { after?: string; limit?: number } = {}) {
        await this.assertRead(context)
        const limit = Math.min(100, Math.max(1, input.limit ?? 30))
        const rows = await this.instances.find({
            where: { ...projectionScope(context), ...(input.after ? { id: MoreThan(input.after) } : {}) },
            order: { id: 'ASC' },
            take: limit + 1
        })
        return { items: rows.slice(0, limit).map(summary), next: rows.length > limit ? rows[limit - 1].id : null }
    }

    async graph(
        context: ProjectPipelineContext,
        instanceId: string,
        input: { roundId?: string } = {}
    ): Promise<ProjectPipelineGraph> {
        const access = await this.assertRead(context)
        const dispatchEnabled = pipelineDispatchEnabled()
        let canEdit = !access.archived && ['owner', 'manager', 'editor'].includes(access.role)
        const descriptors = this.catalog.listForActor(context.actor).flatMap((item) => item.descriptors)
        const scope = projectionScope(context)
        // Repeatable-read prevents a graph from mixing a prior instance revision with newer node rows.
        const saved = await this.instances.manager.transaction('REPEATABLE READ', async (manager) => {
            const instance = await manager.findOneBy(ProjectPipelineInstanceEntity, { ...scope, id: instanceId })
            if (!instance?.currentRoundId) throw new NotFoundException(t('server-ai:Error.ProjectPipelineNotFound'))
            const round = await manager.findOneBy(ProjectPipelineRoundEntity, {
                ...scope,
                id: input.roundId ?? instance.currentRoundId
            })
            const run =
                round && (await manager.findOneBy(ProjectPipelineRunEntity, { ...scope, id: round.runId, instanceId }))
            if (!round || !run) throw new NotFoundException(t('server-ai:Error.ProjectPipelineNotFound'))
            const historical = round.id !== instance.currentRoundId
            canEdit = canEdit && !historical
            const definition = await manager.findOneByOrFail(ProjectPipelineDefinitionEntity, {
                ...scope,
                id: run.definitionId
            })
            const nodes = await manager.find(ProjectPipelineNodeEntity, {
                where: { ...scope, roundId: round.id, disposition: 'active' }
            })
            const refresh = await manager.findOneBy(ProjectPipelineRefreshEntity, {
                ...scope,
                ownerRef: instance.ownerRef,
                sourceKey: instance.sourceKey
            })
            const attentions = await manager.find(ProjectPipelineAttentionEntity, {
                where: { ...scope, roundId: round.id },
                order: { createdAt: 'ASC' }
            })
            const attentionViews = await Promise.all(
                attentions.map(
                    async ({
                        id,
                        nodeInstanceId,
                        kind,
                        state,
                        revision,
                        generation,
                        inputDigest,
                        reasonCode,
                        outcomes
                    }) => {
                        const node = nodes.find((item) => item.id === nodeInstanceId)
                        const spec =
                            definition.definition.executionAuthority === 'platform'
                                ? definition.definition.nodes.find((item) => item.key === node?.nodeKey)
                                : undefined
                        const inputs =
                            kind === 'human' && spec
                                ? await pipelineInputs(manager, context, round, spec, run.bindingSnapshot)
                                : {}
                        const inputEvidence = Object.values(inputs).flatMap((input) =>
                            input.kind === 'evidence'
                                ? [input.value]
                                : input.kind === 'evidence_collection'
                                  ? input.value
                                  : []
                        )
                        return {
                            id,
                            nodeInstanceId,
                            source: 'coordinator' as const,
                            kind,
                            state,
                            revision,
                            generation,
                            inputDigest,
                            reasonCode,
                            outcomes,
                            inputEvidence
                        }
                    }
                )
            )
            const providerAttentions =
                instance.authority === 'provider'
                    ? await providerActionAttentions(manager, context, instanceId, round.id)
                    : []
            const operations =
                instance.authority === 'platform'
                    ? await manager.find(ProjectPipelineOperationEntity, { where: { ...scope, roundId: round.id } })
                    : []
            const retryable =
                dispatchEnabled && canEdit && ['active', 'waiting'].includes(run.state) && round.state === 'active'
                    ? operations.filter((operation) => {
                          const node = nodes.find((node) => node.id === operation.nodeInstanceId)
                          return (
                              node &&
                              !pipelineRetryReason(
                                  operation,
                                  node,
                                  run,
                                  descriptors.find(
                                      (item) => item.kind === 'operation' && item.ref === operation.handlerRef
                                  ),
                                  operations.filter((item) => item.nodeInstanceId === operation.nodeInstanceId).length,
                                  new Date()
                              )
                          )
                      })
                    : []
            const liveGraph = await this.taskGraph.graphWithinTransaction(context, manager)
            const graph =
                historical && instance.authority === 'provider'
                    ? observeHistoricalPipelineTasks(
                          providerHistoryTasks(
                              context.projectId,
                              instanceId,
                              instance.ownerRef,
                              String(instance.revision),
                              round.projectionTasks ?? []
                          ),
                          liveGraph
                      )
                    : liveGraph
            const attributed = attributePipelineExecutions(
                nodes.map((node) => ({
                    id: node.id,
                    projection: projectPipelineProjectionNodeSchema.parse(node.projection),
                    taskIds: node.taskIds
                })),
                round.id,
                graph.executions,
                await pipelineExecutionOwners(manager, context, instanceId, instance.authority)
            )
            const executionIds = new Set(attributed.nodes.flatMap((node) => node.executionIds))
            graph.executions = graph.executions.filter((attempt) => executionIds.has(attempt.id))
            const modelUsage = await readPipelineModelUsage(
                manager,
                context,
                selectedPipelineAttemptFacts(attributed.nodes, graph.executions, historical).flatMap((attempt) =>
                    attempt.agentExecutionId ? [attempt.agentExecutionId] : []
                )
            )
            return {
                instance,
                historical,
                runId: run.id,
                definition: projectPipelineDefinitionSchema.parse(definition.definition),
                round,
                runState: run.state,
                actions: {
                    cancel:
                        canEdit &&
                        instance.authority === 'platform' &&
                        ['active', 'pending', 'waiting'].includes(run.state),
                    retries: retryable.map((operation) => ({
                        nodeInstanceId: operation.nodeInstanceId,
                        operationId: operation.id
                    }))
                },
                attentions: [...attentionViews, ...providerAttentions],
                refresh: refresh
                    ? { state: refresh.state, errorCode: refresh.errorCode, updatedAt: refresh.updatedAt.toISOString() }
                    : null,
                historyComplete: !historical || instance.authority !== 'provider' || round.projectionTasks !== null,
                graph,
                modelUsage,
                nativeModelBudget: instance.nativeModelBudget
                    ? await pipelineModelBudgetTotals(manager, instance)
                    : null,
                nodes: observePipelineNodes(attributed.nodes, graph.executions),
                executionAttribution: attributed.executionAttribution,
                edges: z.array(projectPipelineProjectionEdgeSchema).parse(round.edges)
            }
        })
        const taskIds = new Set(saved.nodes.flatMap((node) => node.taskIds))
        const graph = saved.graph
        return {
            projectId: context.projectId,
            instance: summary(saved.instance),
            cursor: `${saved.round.id}:${saved.instance.revision}:${graph.cursor}:${saved.refresh?.updatedAt ?? ''}:${pipelineDigest({ attribution: saved.nodes.map((node) => [node.id, node.executionIds]), executionAttribution: saved.executionAttribution, dispatchEnabled, canEdit, canManage: access.canManage, actions: saved.actions, modelUsage: saved.modelUsage, nativeModelBudget: saved.nativeModelBudget, attentions: saved.attentions.map((attention) => ({ ...attention })) })}`,
            definition: saved.definition,
            runId: saved.runId,
            historical: saved.historical,
            historyComplete: saved.historyComplete,
            snapshotAt: saved.round.updatedAt.toISOString(),
            runState: saved.runState,
            roundId: saved.round.id,
            round: {
                sequence: saved.round.sequence,
                generation: saved.round.generation,
                state: saved.round.state,
                inputDigest: saved.round.inputDigest
            },
            dispatchEnabled,
            executionAttribution: saved.executionAttribution,
            nodes: saved.nodes,
            edges: saved.edges,
            refresh: saved.refresh,
            attentions: saved.attentions,
            statistics: {
                ...projectPipelineStatistics(saved.nodes, graph.executions, saved.historical, 'round'),
                modelUsage: saved.modelUsage,
                ...(saved.nativeModelBudget
                    ? {
                          nativeModelBudget: {
                              scope: 'instance_native_llm' as const,
                              policy: saved.instance.nativeModelBudget,
                              calls: saved.nativeModelBudget.calls,
                              heldCalls: saved.nativeModelBudget.held,
                              actualTokens: saved.nativeModelBudget.actual,
                              chargedAndReservedTokens: saved.nativeModelBudget.tokens,
                              admissionBlocked:
                                  saved.nativeModelBudget.calls >= saved.instance.nativeModelBudget.maxCalls ||
                                  saved.nativeModelBudget.tokens + saved.instance.nativeModelBudget.reservationTokens >
                                      saved.instance.nativeModelBudget.maxTokens
                          }
                      }
                    : {})
            },
            permissions: { canEdit, canManage: !saved.historical && !access.archived && access.canManage },
            actions: saved.actions,
            tasks: {
                ...graph,
                tasks: graph.tasks.filter((task) => taskIds.has(task.id)),
                executions: graph.executions.filter((execution) => taskIds.has(execution.taskId))
            }
        }
    }

    async rounds(context: ProjectPipelineContext, instanceId: string, input: { after?: string; limit?: number } = {}) {
        await this.assertRead(context)
        const scope = projectionScope(context)
        const instance = await this.instances.findOneBy({ ...scope, id: instanceId })
        if (!instance) throw new NotFoundException(t('server-ai:Error.ProjectPipelineNotFound'))
        const limit = Math.min(100, Math.max(1, input.limit ?? 30))
        const rows = this.instances.manager
            .getRepository(ProjectPipelineRoundEntity)
            .createQueryBuilder('round')
            .innerJoin(
                ProjectPipelineRunEntity,
                'run',
                'run.id = round."runId" AND run."projectId" = round."projectId"'
            )
            .where('run."instanceId" = :instanceId AND run."projectId" = :projectId', {
                instanceId,
                projectId: context.projectId
            })
        if (input.after) {
            const cursor = await rows.clone().andWhere('round.id = :id', { id: input.after }).getOne()
            if (!cursor) throw new NotFoundException(t('server-ai:Error.ProjectPipelineNotFound'))
            rows.andWhere(
                (query) => {
                    const timestamp = query
                        .subQuery()
                        .select('MAX(cursor."createdAt")')
                        .from(ProjectPipelineRoundEntity, 'cursor')
                        .where('cursor.id = :after')
                        .getQuery()
                    return `(round."createdAt" < ${timestamp} OR (round."createdAt" = ${timestamp} AND round.id < :after))`
                },
                { after: cursor.id }
            )
        }
        const page = await rows
            .orderBy('round.createdAt', 'DESC')
            .addOrderBy('round.id', 'DESC')
            .take(limit + 1)
            .getMany()
        return {
            items: page.slice(0, limit).map((round) => ({
                id: round.id,
                runId: round.runId,
                sequence: round.sequence,
                generation: round.generation,
                state: round.state,
                current: round.id === instance.currentRoundId,
                createdAt: round.createdAt.toISOString()
            })),
            next: page.length > limit ? page[limit - 1].id : null
        }
    }

    refresh(context: ProjectPipelineContext, input: { providerRef: string; sourceKey: string }) {
        return this.projection.request(context, input)
    }

    synchronize(context: ProjectPipelineContext, input: { providerRef: string; sourceKey: string }) {
        return this.projection.synchronize(context, input)
    }
}

function summary(instance: ProjectPipelineInstanceEntity): ProjectPipelineSummary {
    return {
        id: instance.id,
        title: instance.title,
        authority: instance.authority,
        ownerRef: instance.ownerRef,
        sourceKey: instance.sourceKey,
        revision: instance.revision,
        updatedAt: instance.updatedAt.toISOString()
    }
}
import { pipelineModelBudgetTotals } from '../budget/pipeline-model-budget.store'
