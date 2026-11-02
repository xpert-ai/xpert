// Resume identity must be authorized before admission can create or mutate a writer claim.
import { ForbiddenException } from '@nestjs/common'
import { TXpertChatResumeRequest } from '@xpert-ai/contracts'
import { EntityManager, IsNull } from 'typeorm'
import { t } from 'i18next'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { ChatConversation } from './conversation.entity'

export function resumeTargetDenied(): ForbiddenException {
    return new ForbiddenException(
        t('server-ai:Error.ExecutionAccessDenied', {
            defaultValue: 'You do not have access to this execution.'
        })
    )
}

export async function resolveResumeTarget(
    manager: EntityManager,
    conversation: ChatConversation,
    threadId: string,
    request: TXpertChatResumeRequest,
    suppliedExecutionId?: string
): Promise<{ executionId: string; aiMessageId: string }> {
    const scope = {
        tenantId: conversation.tenantId,
        organizationId: conversation.organizationId ?? IsNull()
    }
    const message = await manager.getRepository(ChatMessage).findOne({
        where: {
            ...scope,
            conversationId: conversation.id,
            role: 'ai',
            ...(request.target.aiMessageId
                ? { id: request.target.aiMessageId }
                : { executionId: request.target.executionId ?? suppliedExecutionId ?? IsNull() })
        },
        order: { createdAt: 'DESC' }
    })
    const executionId = message?.executionId
    if (
        !executionId ||
        (request.target.executionId && request.target.executionId !== executionId) ||
        (suppliedExecutionId && suppliedExecutionId !== executionId)
    )
        throw resumeTargetDenied()
    const execution = await manager.getRepository(XpertAgentExecution).findOneBy({
        ...scope,
        id: executionId,
        threadId,
        createdById: conversation.createdById
    })
    if (!execution || (message.createdInThreadId && message.createdInThreadId !== threadId)) {
        throw resumeTargetDenied()
    }
    return { executionId, aiMessageId: message.id }
}
