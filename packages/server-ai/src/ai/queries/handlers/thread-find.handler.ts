import { ReadThreadControlViewQuery } from '../../../chat-conversation/control-view/read-thread-control-view.query'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import {
    AssertChatConversationAccessQuery,
    ChatConversationThreadService,
    GetChatConversationQuery
} from '../../../chat-conversation'
import { Optional } from '@nestjs/common'
import { ThreadDTO } from '../../dto'
import { assertPublicXpertSessionConversationAccess } from '../../public-xpert-principal'
import { FindThreadQuery } from '../thread-find.query'

@QueryHandler(FindThreadQuery)
export class FindThreadHandler implements IQueryHandler<FindThreadQuery> {
    constructor(
        private readonly queryBus: QueryBus,
        @Optional() private readonly conversationThreadService?: ChatConversationThreadService
    ) {}

    public async execute(command: FindThreadQuery): Promise<ThreadDTO> {
        const thread = this.conversationThreadService
            ? await this.conversationThreadService.requireByThreadId(command.threadId)
            : null
        const chatConversation =
            thread?.conversation ??
            (await this.queryBus.execute(
                new GetChatConversationQuery({ threadId: command.threadId }, command.relations)
            ))
        await this.queryBus.execute(new AssertChatConversationAccessQuery({ id: chatConversation.id }))
        await assertPublicXpertSessionConversationAccess(chatConversation, this.queryBus)

        // Full execution values belong to /state; ordinary reads must not hydrate checkpoints.
        if (!thread) return new ThreadDTO(chatConversation)
        const snapshot = await this.queryBus.execute(new ReadThreadControlViewQuery(command.threadId))
        return Object.assign(new ThreadDTO(chatConversation, undefined, snapshot.thread), {
            controlView: snapshot.controlView
        })
    }
}
