import { IChatConversation, RolesEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { ForbiddenException } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { t } from 'i18next'
import {
    assertPublicXpertSessionConversationAccess,
    getPublicXpertSessionAssistantId
} from '../../../ai/public-xpert-principal'
import { AssertChatConversationAccessQuery } from '../../../chat-conversation/queries/conversation-assert-access.query'
import { FindChatConversationQuery } from '../../../chat-conversation/queries/conversation-find.query'
import { XpertAgentExecutionService } from '../../agent-execution.service'
import { assertExecutionBelongsToThread } from '../../execution-access'
import { AssertXpertAgentExecutionAccessQuery } from '../assert-access.query'

@QueryHandler(AssertXpertAgentExecutionAccessQuery)
export class AssertXpertAgentExecutionAccessHandler implements IQueryHandler<AssertXpertAgentExecutionAccessQuery> {
    constructor(
        private readonly service: XpertAgentExecutionService,
        private readonly queryBus: QueryBus
    ) {}

    async execute(query: AssertXpertAgentExecutionAccessQuery) {
        const execution = await this.service.findOne(query.id)
        if (query.expectedThreadId) {
            assertExecutionBelongsToThread(execution, query.expectedThreadId)
        }

        if (execution.threadId) {
            const { items } = await this.queryBus.execute<
                FindChatConversationQuery,
                { items: IChatConversation[]; total: number }
            >(new FindChatConversationQuery({ threadId: execution.threadId }, { take: 1 }))
            const conversation = items[0]
            if (conversation) {
                await assertPublicXpertSessionConversationAccess(conversation, this.queryBus)
                await this.queryBus.execute(
                    new AssertChatConversationAccessQuery({ id: conversation.id }, query.operation)
                )
                return execution
            }
        }

        if (getPublicXpertSessionAssistantId()) {
            throw executionAccessDenied()
        }

        const currentUserId = RequestContext.currentUserId()
        if (
            RequestContext.hasRoles([RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN]) ||
            (currentUserId && execution.createdById === currentUserId)
        ) {
            return execution
        }

        throw executionAccessDenied()
    }
}

function executionAccessDenied() {
    return new ForbiddenException(
        t('server-ai:Error.ExecutionAccessDenied', {
            defaultValue: 'You do not have access to this execution'
        })
    )
}
