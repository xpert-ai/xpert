import type { EntityManager } from 'typeorm'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { ProjectPipelineNativeGrantEntity, ProjectPipelineOperationEntity } from '../persistence/pipeline.entity'
import type { PipelineExecutionOwner } from './pipeline-execution-attribution'

/** Read all rounds so known older executions are excluded rather than reported as unattributed. */
export async function pipelineExecutionOwners(
    manager: EntityManager,
    context: ProjectPipelineContext,
    instanceId: string,
    authority: 'platform' | 'provider'
): Promise<PipelineExecutionOwner[]> {
    const where = { ...projectionScope(context), instanceId }
    if (authority === 'platform') {
        const operations = await manager.find(ProjectPipelineOperationEntity, {
            where: { ...where, kind: 'operation' },
            select: ['id', 'roundId', 'nodeInstanceId']
        })
        return operations.map((operation) => ({
            operationId: operation.id,
            roundId: operation.roundId,
            nodeInstanceId: operation.nodeInstanceId
        }))
    }
    const grants = await manager.find(ProjectPipelineNativeGrantEntity, {
        where,
        select: ['roundId', 'nodeInstanceId', 'executionId', 'consumedAt']
    })
    return grants
        .filter((grant) => grant.consumedAt)
        .map((grant) => ({
            agentExecutionId: grant.executionId,
            roundId: grant.roundId,
            nodeInstanceId: grant.nodeInstanceId
        }))
}
