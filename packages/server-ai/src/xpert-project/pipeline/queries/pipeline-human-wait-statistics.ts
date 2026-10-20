import { In, type EntityManager } from 'typeorm'
import { z } from 'zod/v3'
import {
    pipelineHumanWaitSnapshotSchema,
    pipelineHumanWaitStatistics,
    type PipelineHumanWaitEvent,
    type ProjectPipelineAnalyticsInput
} from '@xpert-ai/contracts'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { ProjectPipelineEventEntity } from '../persistence/pipeline.entity'

const observationPayload = z.object({ humanWaitSnapshot: pipelineHumanWaitSnapshotSchema.optional() })

export async function readPipelineHumanWaitStatistics(
    manager: EntityManager,
    context: ProjectPipelineContext,
    instanceIds: string[],
    currentWaitingNodeIds: string[],
    window: ProjectPipelineAnalyticsInput,
    snapshotAt: string
) {
    const events: PipelineHumanWaitEvent[] = []
    if (instanceIds.length) {
        const rows = await manager.find(ProjectPipelineEventEntity, {
            where: { ...projectionScope(context), instanceId: In(instanceIds) },
            select: { instanceId: true, revision: true, payload: true }
        })
        for (const row of rows) {
            const parsed = observationPayload.safeParse(row.payload)
            events.push({
                instanceId: row.instanceId,
                revision: row.revision,
                snapshot: parsed.success ? (parsed.data.humanWaitSnapshot ?? null) : null,
                invalid: !parsed.success
            })
        }
    }
    return pipelineHumanWaitStatistics(events, currentWaitingNodeIds, { from: window.from, to: window.to }, snapshotAt)
}
