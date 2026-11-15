// A continuation is a new root turn, not a child graph execution. Only its durable inbox claim
// and original invocation establish lineage; message correlation and thread equality are insufficient.
import { z } from 'zod/v3'
import { IsNull, type EntityManager } from 'typeorm'
import { agentInvocationDispatchContextSchema, agentRuntimeResultClaimSchema } from '@xpert-ai/plugin-sdk'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { AgentRuntimeInbox } from './runtime-message.entity'
import { runtimeMessageError } from './runtime-message.errors'

type Actor = { tenantId: string; organizationId?: string; userId: string }
const originSchema = z.object({ inboxId: z.string().uuid() }).strict()

export async function runtimeExecutionOrigin(manager: EntityManager, execution: XpertAgentExecution, actor: Actor) {
    const scope = { tenantId: actor.tenantId, organizationId: actor.organizationId ?? IsNull(), ownerId: actor.userId }
    let inbox: AgentRuntimeInbox | null
    if (execution.metadata?.runtimeContinuation === undefined) {
        // Upgrade compatibility: old root turns already have the same durable claim, but no metadata link.
        // The scoped inbox index limits this read to the actor; never infer lineage from a shared thread.
        if (execution.parentId) return null
        const matches = await manager
            .getRepository(AgentRuntimeInbox)
            .createQueryBuilder('inbox')
            .where(scope)
            .andWhere("inbox.claim->'consumer'->>'type' = 'follow_up'")
            .andWhere("inbox.claim->'consumer'->>'executionId' = :executionId", { executionId: execution.id })
            .take(2)
            .getMany()
        if (!matches.length) return null
        if (matches.length !== 1) throw runtimeMessageError('Invalid')
        inbox = matches[0]
    } else {
        const origin = originSchema.safeParse(execution.metadata.runtimeContinuation)
        if (!origin.success) throw runtimeMessageError('Invalid')
        inbox = await manager.findOneBy(AgentRuntimeInbox, { ...scope, id: origin.data.inboxId })
    }
    const claim = agentRuntimeResultClaimSchema.safeParse(inbox?.claim)
    if (
        !inbox ||
        !claim.success ||
        claim.data.consumer.type !== 'follow_up' ||
        claim.data.consumer.executionId !== execution.id ||
        claim.data.invocationId !== inbox.invocationId ||
        execution.createdById !== actor.userId
    )
        throw runtimeMessageError('Invalid')
    const record = await manager.findOneBy(AgentInvocationEntity, {
        ...scope,
        id: inbox.invocationId,
        ownerId: actor.userId
    })
    if (!record || record.invocation.id !== inbox.invocationId) throw runtimeMessageError('Invalid')
    const invocation = record.invocation
    const dispatch = agentInvocationDispatchContextSchema.safeParse(invocation.request.dispatch)
    if (!dispatch.success) throw runtimeMessageError('Invalid')
    const recipient = dispatch.data.replyTo
    if (
        inbox.event.kind !== 'result' ||
        inbox.event.invocationId !== invocation.id ||
        inbox.event.revision !== claim.data.resultRevision ||
        invocation.scope.tenantId !== actor.tenantId ||
        (invocation.scope.organizationId ?? null) !== (actor.organizationId ?? null) ||
        invocation.scope.userId !== actor.userId ||
        recipient.threadId !== execution.threadId ||
        recipient.agentKey !== execution.agentKey ||
        recipient.conversationId !== invocation.scope.conversationId ||
        claim.data.recipient.threadId !== recipient.threadId ||
        claim.data.recipient.conversationId !== recipient.conversationId ||
        claim.data.recipient.agentKey !== recipient.agentKey ||
        claim.data.recipient.type !== recipient.type ||
        (recipient.type === 'project_agent'
            ? claim.data.recipient.type !== 'project_agent' ||
              claim.data.recipient.projectId !== recipient.projectId ||
              recipient.projectId !== invocation.scope.projectId
            : claim.data.recipient.type === 'project_agent' || claim.data.recipient.xpertId !== recipient.xpertId) ||
        (recipient.type === 'project_agent'
            ? execution.type !== 'project_agent' || Boolean(execution.xpertId)
            : recipient.xpertId !== execution.xpertId)
    )
        throw runtimeMessageError('Invalid')
    return {
        sourceExecutionId: invocation.scope.parentExecutionId,
        execution,
        inbox,
        projectId: invocation.scope.projectId
    }
}
