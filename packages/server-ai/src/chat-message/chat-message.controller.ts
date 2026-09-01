import { TransformInterceptor, UUIDValidationPipe } from '@xpert-ai/server-core'
import { Controller, Get, Param, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AssertChatConversationAccessQuery } from '../chat-conversation/queries/conversation-assert-access.query'
import { ChatMessageService } from './chat-message.service'
import { SuggestedQuestionsCommand } from './commands/'

@ApiTags('ChatMessage')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class ChatMessageController {
    constructor(
        private readonly service: ChatMessageService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus
    ) {}

    @Get(':id/suggested-questions')
    async suggestedQuestions(@Param('id', UUIDValidationPipe) id: string) {
        const message = await this.service.findOneInOrganizationOrTenant(id)
        await this.queryBus.execute(new AssertChatConversationAccessQuery({ id: message.conversationId }))
        return this.commandBus.execute(new SuggestedQuestionsCommand({ messageId: id }))
    }
}
