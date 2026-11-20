import { ForbiddenException } from '@nestjs/common'
import type { QueryBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { assertPublicXpertSessionConversationAccess } from '../ai/public-xpert-principal'
import { AssertChatConversationAccessQuery } from './queries/conversation-assert-access.query'

/** Host-owned execution identity; never supplied by tool arguments or middleware node options. */
export interface ConversationTurn {
    conversationId: string
    threadId: string
    executionId: string
    inputMessageId?: string
    tenantId: string
    organizationId?: string | null
    userId: string
    isStart: boolean
    leaderKey?: string
}

export const CONVERSATION_TURN = Symbol('conversation-turn')
export interface ConversationMiddlewareContext {
    readonly [CONVERSATION_TURN]?: ConversationTurn
}

export async function assertConversationTurnAccess(queries: Pick<QueryBus, 'execute'>, scope: ConversationTurn) {
    if (
        scope.userId !== RequestContext.currentUserId() ||
        scope.tenantId !== RequestContext.currentTenantId() ||
        (scope.organizationId ?? null) !== (RequestContext.getOrganizationId() ?? null)
    )
        throw new ForbiddenException('Conversation actor unavailable')
    const conversation = await queries.execute(
        new AssertChatConversationAccessQuery({ threadId: scope.threadId }, 'contribute')
    )
    if (conversation.id !== scope.conversationId) throw new ForbiddenException('Conversation unavailable')
    await assertPublicXpertSessionConversationAccess(conversation, queries)
}
