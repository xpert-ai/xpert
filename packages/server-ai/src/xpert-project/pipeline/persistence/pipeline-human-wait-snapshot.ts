import { type EntityManager } from 'typeorm'
import {
    pipelineNodeNeedsHuman,
    pipelineHumanWaitSnapshotSchema,
    projectPipelineProjectionNodeSchema,
    type PipelineHumanWaitSnapshot
} from '@xpert-ai/contracts'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineInstanceEntity,
    ProjectPipelineRunEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineEventEntity
} from './pipeline.entity'

/** Event and complete waiting-set observation commit with Task/Pipeline state under the Project lock.
 * Repeated observations retain the original open interval; missing legacy events are never backdated. */
export async function capturePipelineHumanWaitSnapshot(
    manager: EntityManager,
    context: ProjectPipelineContext,
    instanceId: string
): Promise<PipelineHumanWaitSnapshot> {
    if (!manager.queryRunner?.isTransactionActive) throw Error('PIPELINE_WAIT_OBSERVATION_REQUIRES_TRANSACTION')
    const scope = projectionScope(context)
    const instance = await manager.findOneByOrFail(ProjectPipelineInstanceEntity, { ...scope, id: instanceId })
    if (!instance.currentRunId || !instance.currentRoundId) throw Error('PIPELINE_WAIT_CURRENT_ROUND_REQUIRED')
    const run = await manager.findOneByOrFail(ProjectPipelineRunEntity, {
        ...scope,
        id: instance.currentRunId,
        instanceId
    })
    const round = await manager.findOneByOrFail(ProjectPipelineRoundEntity, {
        ...scope,
        id: instance.currentRoundId,
        runId: run.id
    })
    const nodes =
        round.state === 'active' && ['active', 'pending', 'waiting'].includes(run.state)
            ? await manager.find(ProjectPipelineNodeEntity, {
                  where: { ...scope, roundId: round.id, disposition: 'active' },
                  select: { id: true, projection: true }
              })
            : []
    const nodeIds = nodes
        .filter((node) => pipelineNodeNeedsHuman(projectPipelineProjectionNodeSchema.parse(node.projection)))
        .map((node) => node.id)
        .sort()
    const rows: Array<{ now: Date }> = await manager.query('SELECT clock_timestamp() AS now')
    return pipelineHumanWaitSnapshotSchema.parse({ schemaVersion: 1, observedAt: rows[0].now.toISOString(), nodeIds })
}

/** Lifecycle command events are reserved before mutation and sealed before any later event is written. */
export async function sealPipelineHumanWaitSnapshot(
    manager: EntityManager,
    context: ProjectPipelineContext,
    eventId: string
) {
    const where = { ...projectionScope(context), id: eventId }
    const event = await manager.findOneByOrFail(ProjectPipelineEventEntity, where)
    const humanWaitSnapshot = await capturePipelineHumanWaitSnapshot(manager, context, event.instanceId)
    await manager.update(ProjectPipelineEventEntity, where, { payload: { ...event.payload, humanWaitSnapshot } })
}
