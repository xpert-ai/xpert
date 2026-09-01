import { IChatConversation } from '@xpert-ai/contracts'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { FindOptionsWhere, In } from 'typeorm'
import { FindChatConversationQuery } from '../../../chat-conversation/queries/conversation-find.query'
import { ThreadDTO } from '../../dto'
import { getPublicXpertSessionConversationScope } from '../../public-xpert-principal'
import { SearchThreadsQuery } from '../thread-search.query'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ForbiddenException } from '@nestjs/common'
import { t } from 'i18next'
import { PublishedXpertAccessService } from '../../../xpert/published-xpert-access.service'

@QueryHandler(SearchThreadsQuery)
export class SearchThreadsHandler implements IQueryHandler<SearchThreadsQuery> {
    constructor(
        private readonly queryBus: QueryBus,
        private readonly publishedXpertAccessService: PublishedXpertAccessService
    ) {}

    public async execute(command: SearchThreadsQuery): Promise<ThreadDTO> {
        const request = command.request

        const conditions = {} as FindOptionsWhere<IChatConversation>
        const publicScope = getPublicXpertSessionConversationScope()
        if (publicScope) {
            conditions.createdById = publicScope.createdById
        } else {
            const currentUserId = RequestContext.currentUserId()
            if (!currentUserId) {
                throw new ForbiddenException(
                    t('server-ai:Error.ConversationUserContextRequired', {
                        defaultValue: 'A user context is required to list conversations'
                    })
                )
            }
            conditions.createdById = currentUserId
        }
        const assistantId = publicScope?.xpertId ?? request.metadata?.assistant_id
        if (assistantId) {
            conditions.xpertId = In(
                await this.publishedXpertAccessService.getAccessiblePublishedXpertFamilyIds(assistantId)
            )
        }
        if (request.status) {
            conditions.status = request.status
        }
        const { items } = await this.queryBus.execute(
            new FindChatConversationQuery(conditions, {
                take: request.limit,
                skip: request.offset
            })
        )

        return items.map((_) => new ThreadDTO(_))
    }
}
