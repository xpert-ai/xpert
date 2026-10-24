// Current business state and historical execution cohorts share one authorized MVCC snapshot.
// A saved task timestamp is never substituted for the actual runtime start time.
import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'
import { t } from 'i18next'
import {
    projectPipelineAnalytics,
    pipelineAnalyticsFacts,
    pipelineNodeNeedsHuman,
    projectPipelineProjectionNodeSchema,
    type ProjectPipelineAnalyticsInput,
    type PipelineAnalyticsInstanceFacts
} from '@xpert-ai/contracts'
import {
    ProjectPipelineAnalyticsRuntimeCapability,
    type ProjectPipelineAnalyticsApi,
    type ProjectPipelineContext
} from '@xpert-ai/plugin-sdk'
import { RuntimeCapabilityProvider } from '../../../shared/runtime/runtime-capability-provider.decorator'
import { ProjectAccessRuntimeService } from '../../services/project-access-runtime.service'
import { ProjectTaskGraphService } from '../../services/project-task-graph.service'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineInstanceEntity,
    ProjectPipelineRunEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineDefinitionEntity
} from '../persistence/pipeline.entity'
import { observePipelineNodes } from './pipeline-node-observations'
import { attributePipelineExecutions } from './pipeline-execution-attribution'
import { pipelineExecutionOwners } from './pipeline-execution-owners'
import { readPipelineModelUsage } from './pipeline-model-usage'
import { readPipelineQueueStatistics } from './pipeline-queue-statistics'
import { readPipelineHumanWaitStatistics } from './pipeline-human-wait-statistics'

@Injectable()
@RuntimeCapabilityProvider(ProjectPipelineAnalyticsRuntimeCapability)
export class ProjectPipelineAnalyticsService implements ProjectPipelineAnalyticsApi {
    constructor(
        @InjectRepository(ProjectPipelineInstanceEntity)
        private readonly instances: Repository<ProjectPipelineInstanceEntity>,
        private readonly access: ProjectAccessRuntimeService,
        private readonly tasks: ProjectTaskGraphService
    ) {}

    async read(context: ProjectPipelineContext, input: ProjectPipelineAnalyticsInput) {
        if (!(await this.access.listReadable({ actor: context.actor, projectIds: [context.projectId] })).length)
            throw new ForbiddenException(t('server-ai:Error.ProjectTaskAccessDenied'))
        return this.instances.manager.transaction('REPEATABLE READ', async (manager) => {
            // Establish the MVCC snapshot and use the observation clock before reading any facts.
            const clock: Array<{ snapshotAt: Date }> = await manager.query('SELECT clock_timestamp() AS "snapshotAt"')
            const snapshotAt = clock[0].snapshotAt.toISOString()
            return (await this.readWithinTransaction(context, input, manager, snapshotAt)).report
        })
    }

    /** Caller must authorize the exact Project before using this transaction-scoped fact reader. */
    async readWithinTransaction(
        context: ProjectPipelineContext,
        input: ProjectPipelineAnalyticsInput,
        manager: EntityManager,
        snapshotAt: string
    ) {
        const where = projectionScope(context)
        const instances = await manager.find(ProjectPipelineInstanceEntity, { where })
        const runs = await manager.find(ProjectPipelineRunEntity, { where })
        const rounds = await manager.find(ProjectPipelineRoundEntity, { where })
        const nodes = await manager.find(ProjectPipelineNodeEntity, { where })
        const definitions = await manager.find(ProjectPipelineDefinitionEntity, { where })
        const taskGraph = await this.tasks.graphWithinTransaction(context, manager)
        const facts: PipelineAnalyticsInstanceFacts[] = []
        const waitingNodeIds: string[] = []
        for (const instance of instances) {
            const run = runs.find((run) => run.id === instance.currentRunId && run.instanceId === instance.id)
            const round = rounds.find((round) => round.id === instance.currentRoundId && round.runId === run?.id)
            const definition = definitions.find((definition) => definition.id === run?.definitionId)
            if (!run || !round || !definition) continue
            const runIds = new Set(runs.filter((item) => item.instanceId === instance.id).map((item) => item.id))
            const roundIds = new Set(rounds.filter((item) => runIds.has(item.runId)).map((item) => item.id))
            // Analytics uses the same durable node/round ownership as the swimlane, including history.
            const owners = await pipelineExecutionOwners(manager, context, instance.id, instance.authority)
            const attributed = new Map(
                [...roundIds].flatMap((roundId) => {
                    const roundNodes = attributePipelineExecutions(
                        nodes
                            .filter((node) => node.roundId === roundId)
                            .map((node) => ({
                                id: node.id,
                                taskIds: node.taskIds,
                                projection: projectPipelineProjectionNodeSchema.parse(node.projection)
                            })),
                        roundId,
                        taskGraph.executions,
                        owners
                    ).nodes
                    return observePipelineNodes(roundNodes, taskGraph.executions).map(
                        (node) => [node.id, node] as const
                    )
                })
            )
            const parse = (node: ProjectPipelineNodeEntity) => attributed.get(node.id)!
            if (round.state === 'active' && ['active', 'pending', 'waiting'].includes(run.state))
                waitingNodeIds.push(
                    ...nodes
                        .filter(
                            (node) =>
                                node.roundId === round.id &&
                                node.disposition === 'active' &&
                                pipelineNodeNeedsHuman(projectPipelineProjectionNodeSchema.parse(node.projection))
                        )
                        .map((node) => node.id)
                )
            facts.push({
                id: instance.id,
                title: instance.title,
                templateKey: definition.templateKey,
                templateVersion: definition.version,
                authority: instance.authority,
                runState: run.state,
                currentNodes: nodes
                    .filter((node) => node.roundId === round.id && node.disposition === 'active')
                    .map(parse),
                historyNodes: nodes.filter((node) => roundIds.has(node.roundId)).map(parse)
            })
        }
        const selected = pipelineAnalyticsFacts(facts, taskGraph.executions, input).selected
        const modelUsage = await readPipelineModelUsage(
            manager,
            context,
            selected.flatMap((item) => (item.agentExecutionId ? [item.agentExecutionId] : []))
        )
        const queue = await readPipelineQueueStatistics(
            manager,
            context,
            instances.map((instance) => instance.id),
            input,
            snapshotAt
        )
        const humanWait = await readPipelineHumanWaitStatistics(
            manager,
            context,
            instances.map((instance) => instance.id),
            waitingNodeIds,
            input,
            snapshotAt
        )
        const report = {
            ...projectPipelineAnalytics(
                context.projectId,
                facts,
                taskGraph.executions,
                input,
                snapshotAt,
                instances.length - facts.length
            ),
            modelUsage,
            queue,
            humanWait
        }
        return { report, facts, executions: taskGraph.executions }
    }
}
