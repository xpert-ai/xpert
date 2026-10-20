import { In, type EntityManager } from 'typeorm'
import {
    pipelineQueueStatistics,
    type PipelineQueueFact,
    type ProjectPipelineAnalyticsInput
} from '@xpert-ai/contracts'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { ProjectPipelineOperationEntity, ProjectPipelineProviderActionEntity } from '../persistence/pipeline.entity'

/** Use the caller's authorized snapshot; never load operation contexts, inputs or receipts for metrics. */
export async function readPipelineQueueStatistics(
    manager: EntityManager,
    context: ProjectPipelineContext,
    instanceIds: string[],
    window: ProjectPipelineAnalyticsInput,
    snapshotAt: string
) {
    const facts: PipelineQueueFact[] = []
    if (instanceIds.length) {
        const where = { ...projectionScope(context), instanceId: In(instanceIds) }
        const select = { id: true, createdAt: true, dispatchStartedAt: true, state: true } as const
        const operations = await manager.find(ProjectPipelineOperationEntity, { where, select })
        const actions = await manager.find(ProjectPipelineProviderActionEntity, { where, select })
        for (const [source, rows] of [
            ['managed_operation', operations],
            ['provider_action', actions]
        ] as const)
            for (const row of rows)
                facts.push({
                    id: row.id,
                    source,
                    createdAt: row.createdAt?.toISOString() ?? null,
                    dispatchStartedAt: row.dispatchStartedAt?.toISOString() ?? null,
                    waiting: row.state === 'queued'
                })
    }
    return pipelineQueueStatistics(facts, { from: window.from, to: window.to }, snapshotAt)
}
