import type { EntityManager } from 'typeorm'
import { projectPipelineProviderActionCommandSchema, type ProjectPipelineAttention } from '@xpert-ai/contracts'
import type { ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { projectionScope } from '../../services/task-projection/project-task-projection.writer'
import { ProjectPipelineProviderActionEntity } from '../persistence/pipeline.entity'

/** Triage projection only. Unknown operations retain their original inspect obligation and cannot be approved as human gates. */
export async function providerActionAttentions(
    manager: EntityManager,
    context: ProjectPipelineContext,
    instanceId: string,
    roundId: string
): Promise<ProjectPipelineAttention[]> {
    const operations = await manager.find(ProjectPipelineProviderActionEntity, {
        where: { ...projectionScope(context), instanceId, roundId, state: 'unknown' },
        order: { id: 'ASC' }
    })
    return operations.map((operation) => {
        const input = projectPipelineProviderActionCommandSchema.parse(operation.input)
        return {
            id: operation.id,
            nodeInstanceId: operation.nodeInstanceId,
            source: 'provider_action',
            kind: 'unknown',
            state: 'open',
            revision: Math.max(1, operation.leaseFence),
            generation: input.generation,
            inputDigest: input.inputDigest,
            reasonCode: operation.reasonCode ?? 'EXECUTION_CONFIRMATION_PENDING',
            outcomes: [],
            inputEvidence: []
        }
    })
}
