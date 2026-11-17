// Recovery creates a new root, not a graph child. Only host-persisted source links establish lineage;
// sharing a thread is a scope check, never evidence that two otherwise unrelated runs share a budget.
import { IsNull, type EntityManager } from 'typeorm'
import { z } from 'zod/v3'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { pipelineProjectionConflict } from '../projection/pipeline-projection.errors'

const sourceIdSchema = z.string().uuid()
type Actor = { tenantId: string; organizationId?: string; userId: string }

export async function executionRecoveryOrigin(manager: EntityManager, execution: XpertAgentExecution, actor: Actor) {
    const resumed = execution.metadata?.resumedFromExecutionId
    const retried = execution.metadata?.retriedFromExecutionId
    if (resumed === undefined && retried === undefined) return null
    const parsed = sourceIdSchema.safeParse(resumed ?? retried)
    if (
        !parsed.success ||
        (resumed !== undefined && retried !== undefined) ||
        execution.parentId ||
        execution.metadata?.runtimeContinuation !== undefined
    )
        throw pipelineProjectionConflict('MODEL_EXECUTION_ANCESTRY_INVALID')
    const source = await manager.findOne(XpertAgentExecution, {
        where: { tenantId: actor.tenantId, organizationId: actor.organizationId ?? IsNull(), id: parsed.data },
        select: ['id', 'parentId', 'createdById', 'threadId', 'xpertId', 'agentKey', 'type']
    })
    if (!source) throw pipelineProjectionConflict('MODEL_EXECUTION_ANCESTRY_INVALID')
    if (
        source.parentId ||
        source.createdById !== actor.userId ||
        execution.createdById !== actor.userId ||
        !execution.threadId ||
        execution.threadId !== source.threadId ||
        (execution.xpertId ?? null) !== (source.xpertId ?? null) ||
        execution.agentKey !== source.agentKey ||
        execution.type !== source.type
    )
        throw pipelineProjectionConflict('MODEL_EXECUTION_SCOPE_MISMATCH')
    return { execution, sourceExecutionId: source.id }
}
