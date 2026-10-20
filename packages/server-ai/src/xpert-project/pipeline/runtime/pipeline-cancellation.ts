import { EntityManager, In } from 'typeorm'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { XpertProjectTask } from '../../entities/project-task.entity'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import {
    ProjectPipelineAttentionEntity,
    ProjectPipelineEventEntity,
    ProjectPipelineInstanceEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineOperationEntity,
    ProjectPipelineRoundEntity,
    ProjectPipelineRunEntity
} from '../persistence/pipeline.entity'
import { pipelineIdentity } from '../persistence/pipeline-identity'
import { managedAudit } from './pipeline-transaction'
import { capturePipelineHumanWaitSnapshot } from '../persistence/pipeline-human-wait-snapshot'

/** A cancellation stops scheduling immediately, but remains pending until every dispatched effect is terminal. */
export async function finishPipelineCancellation(
    manager: EntityManager,
    context: ProjectPipelineContext,
    runId: string
) {
    const scope = projectionScope(context)
    const run = await manager.findOneByOrFail(ProjectPipelineRunEntity, { ...scope, id: runId })
    if (run.state !== 'cancelling') return
    const unresolved = await manager.count(ProjectPipelineOperationEntity, {
        where: { ...scope, runId, state: In(['queued', 'dispatching', 'pending', 'unknown', 'succeeded']) }
    })
    if (unresolved) return
    run.state = 'cancelled'
    await manager.save(run)
    const instance = await manager.findOneByOrFail(ProjectPipelineInstanceEntity, { ...scope, id: run.instanceId })
    const round = await manager.findOneByOrFail(ProjectPipelineRoundEntity, { ...scope, id: instance.currentRoundId })
    round.state = 'cancelled'
    await manager.save(round)
    const nodes = await manager.find(ProjectPipelineNodeEntity, { where: { ...scope, roundId: round.id } })
    for (const node of nodes) {
        if (node.projection.state.lifecycle === 'completed' || node.projection.state.lifecycle === 'failed') continue
        node.projection = {
            ...node.projection,
            state: {
                ...node.projection.state,
                lifecycle: 'cancelled',
                readiness: 'blocked',
                runtime: node.projection.state.runtime === 'cancelling' ? 'cancelled' : node.projection.state.runtime
            }
        }
        await manager.save(node)
        if (node.taskIds.length)
            await manager.update(XpertProjectTask, { ...scope, id: In(node.taskIds) }, { status: 'cancelled' })
    }
    await manager.update(
        ProjectPipelineAttentionEntity,
        { ...scope, instanceId: instance.id, state: 'open' },
        { state: 'resolved' }
    )
    instance.revision += 1
    await manager.save(instance)
    await manager.insert(ProjectPipelineEventEntity, {
        ...managedAudit(context),
        id: pipelineIdentity(context, 'event', instance.id, String(instance.revision)),
        instanceId: instance.id,
        revision: instance.revision,
        type: 'run.cancelled',
        payload: {
            runId,
            roundId: round.id,
            humanWaitSnapshot: await capturePipelineHumanWaitSnapshot(manager, context, instance.id)
        }
    })
}
