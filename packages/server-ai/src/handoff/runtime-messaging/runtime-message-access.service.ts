import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { User, UserOrganization } from '@xpert-ai/server-core'
import { UserType } from '@xpert-ai/contracts'
import {
    AgentInvocation,
    AgentInvocationScope,
    agentInvocationDispatchContextSchema,
    AgentInvocationDispatchContext
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { AgentInvocationFactoryService } from '../../agent-invocation/invocation-factory.service'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../../chat-conversation/conversation-thread.entity'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { captureRequestContext, runWithCapturedRequestContext } from '../../shared/request-context'
import { runtimeMessageError } from './runtime-message.errors'

const scopeSchema = z
    .object({
        tenantId: z.string().uuid(),
        organizationId: z.string().uuid(),
        userId: z.string().uuid(),
        workspaceId: z.string().uuid(),
        conversationId: z.string().uuid(),
        projectId: z.string().uuid().optional(),
        parentExecutionId: z.string().uuid(),
        callerAgentKey: z.string().min(1).max(256),
        callerXpertId: z.string().uuid().optional(),
        callerType: z.enum(['xpert', 'project_agent']).optional()
    })
    .strict()

export type AuthorizedRuntimeReply = {
    invocation: AgentInvocation
    dispatch: AgentInvocationDispatchContext
    conversation: ChatConversation
    user: User
    parentCreatedAt: string
}

/** Restore the original business actor from current membership, never a serialized token or privileged worker identity. */
@Injectable()
export class RuntimeMessageAccessService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly factory: AgentInvocationFactoryService
    ) {}

    async withActor<T>(scope: AgentInvocationScope, work: (user: User) => Promise<T>): Promise<T> {
        const parsed = scopeSchema.safeParse(scope)
        if (!parsed.success) throw runtimeMessageError('Invalid')
        const [user, membership] = await Promise.all([
            this.dataSource
                .getRepository(User)
                .findOne({ where: { id: scope.userId, tenantId: scope.tenantId }, relations: ['role'] }),
            this.dataSource.getRepository(UserOrganization).findOne({
                where: {
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId,
                    userId: scope.userId,
                    isActive: true,
                    organization: { isActive: true }
                }
            })
        ])
        if (!user || user.type !== UserType.USER || !membership) throw runtimeMessageError('Access')
        return runWithCapturedRequestContext(
            captureRequestContext({
                user,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                headers: { 'x-scope-level': 'organization' }
            }),
            () => work(user)
        )
    }

    /** Owners may inspect delivery failures even when a binding was revoked; this grants no result or runtime access. */
    async withReceiptOwner<T>(
        id: string,
        owner: { tenantId?: string; organizationId?: string; ownerId: string },
        work: (record: AgentInvocationEntity, user: User) => Promise<T>
    ): Promise<T> {
        if (!owner.tenantId || !owner.organizationId || !owner.ownerId) throw runtimeMessageError('Access')
        const record = await this.dataSource
            .getRepository(AgentInvocationEntity)
            .findOneBy({ id, tenantId: owner.tenantId, organizationId: owner.organizationId, ownerId: owner.ownerId })
        if (!record || record.invocation.id !== id) throw runtimeMessageError('Access')
        const scope = record.invocation.scope
        if (
            scope.tenantId !== owner.tenantId ||
            scope.organizationId !== owner.organizationId ||
            scope.userId !== owner.ownerId
        )
            throw runtimeMessageError('Access')
        return this.withActor(scope, (user) => work(record, user))
    }

    async withReply<T>(
        id: string,
        owner: { tenantId?: string; organizationId?: string; ownerId: string },
        work: (reply: AuthorizedRuntimeReply) => Promise<T>
    ): Promise<T> {
        return this.withReceiptOwner(id, owner, async (record, user) => {
            const scope = record.invocation.scope
            const parsedDispatch = agentInvocationDispatchContextSchema.safeParse(record.invocation.request.dispatch)
            if (!parsedDispatch.success) throw runtimeMessageError('Invalid')
            const dispatch = parsedDispatch.data
            const recipient = dispatch.replyTo
            if (
                recipient.conversationId !== scope.conversationId ||
                recipient.agentKey !== scope.callerAgentKey ||
                (recipient.type === 'project_agent'
                    ? scope.callerType !== 'project_agent' ||
                      recipient.projectId !== scope.projectId ||
                      Boolean(scope.callerXpertId)
                    : scope.callerType === 'project_agent' || recipient.xpertId !== scope.callerXpertId)
            )
                throw runtimeMessageError('Access')
            const invocation = await this.factory.createCapturedApi(scope).inspect(id)
            const conversation = await this.dataSource.getRepository(ChatConversation).findOneBy({
                id: recipient.conversationId,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                createdById: scope.userId
            })
            const parent = await this.dataSource.getRepository(XpertAgentExecution).findOneBy({
                id: scope.parentExecutionId,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                createdById: scope.userId,
                threadId: recipient.threadId,
                agentKey: recipient.agentKey
            })
            if (
                !conversation ||
                (conversation.projectId ?? undefined) !== scope.projectId ||
                !parent ||
                (recipient.type !== 'project_agent' && parent.xpertId !== recipient.xpertId) ||
                (recipient.type === 'project_agent' && (parent.type !== 'project_agent' || parent.xpertId))
            )
                throw runtimeMessageError('Access')
            if (recipient.type === 'project_agent' && conversation.threadId !== recipient.threadId)
                throw runtimeMessageError('Blocked')
            if (conversation.threadId !== recipient.threadId) {
                const branch = await this.dataSource.getRepository(ChatConversationThread).findOneBy({
                    conversationId: conversation.id,
                    threadId: recipient.threadId,
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId
                })
                if (!branch) throw runtimeMessageError('Access')
            }
            return work({
                invocation,
                dispatch,
                conversation,
                user,
                parentCreatedAt: parent.createdAt?.toISOString() ?? invocation.createdAt
            })
        })
    }
}
