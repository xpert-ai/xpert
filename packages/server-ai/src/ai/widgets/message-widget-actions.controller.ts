import {
    BadRequestException,
    Body,
    ConflictException,
    Controller,
    HttpCode,
    NotFoundException,
    Param,
    ParseUUIDPipe,
    Post,
    UseGuards,
    UseInterceptors
} from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { MessageWidgets } from '../../chat-message/widgets/message-widgets'
import { usesRuntimePresentation } from '../runtime-presentation'
import { WidgetActionProviderRegistry } from '@xpert-ai/plugin-sdk'
import { SecretTokenBindingType } from '@xpert-ai/contracts'
import {
    AllowClientSecretBindings,
    ApiKeyOrClientSecretAuthGuard,
    Public,
    TransformInterceptor,
    ZodValidationPipe
} from '@xpert-ai/server-core'
import { In, Repository } from 'typeorm'
import { AssertChatConversationAccessQuery } from '../../chat-conversation/queries/conversation-assert-access.query'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { messageOffersWidgetAction, widgetActionFields } from './message-widget-action.schema'
import { assertPublicXpertSessionConversationAccess } from '../public-xpert-principal'

@Public()
@AllowClientSecretBindings(SecretTokenBindingType.ENTERPRISE_XPERT)
@Controller('threads/:threadId/messages/:messageId/widgets/:widgetId/actions')
@UseInterceptors(TransformInterceptor)
@UseGuards(ApiKeyOrClientSecretAuthGuard)
export class MessageWidgetActionsController {
    constructor(
        private readonly queries: QueryBus,
        @InjectRepository(ChatMessage) private readonly messages: Repository<ChatMessage>,
        private readonly actions: WidgetActionProviderRegistry,
        private readonly widgets: MessageWidgets
    ) {}

    @Post(':action')
    @HttpCode(200)
    async submit(
        @Param('threadId') threadId: string,
        @Param('messageId', ParseUUIDPipe) messageId: string,
        @Param('widgetId') widgetId: string,
        @Param('action') action: string,
        @Body(new ZodValidationPipe(widgetActionFields, () => new BadRequestException('Invalid widget form')))
        fields: Record<string, unknown>
    ) {
        const conversation = await this.queries.execute(
            new AssertChatConversationAccessQuery({ threadId }, 'contribute')
        )
        await assertPublicXpertSessionConversationAccess(conversation, this.queries)
        const handler = this.actions.resolve(action)
        if (!handler) throw new NotFoundException('Widget action is unavailable')

        const message = await this.messages.findOne({
            where: { id: messageId, conversationId: conversation.id, role: In(['ai', 'assistant']) },
            select: { id: true, createdInThreadId: true }
        })
        if (!message || (message.createdInThreadId ?? conversation.threadId) !== threadId)
            throw new NotFoundException('Widget message is unavailable')

        // Message content is client-editable; only server-issued references can attest an offered action.
        if (handler.widgetSource !== 'receipt') {
            const cards = await this.widgets.resolve(threadId, [messageId], usesRuntimePresentation())
            if (
                !messageOffersWidgetAction(
                    cards.filter((card) => card.messageId === messageId).map((card) => card.widget),
                    widgetId,
                    action
                )
            )
                throw new ConflictException('This widget no longer offers that action')
        }
        return handler.execute({ threadId, messageId, widgetId, fields })
    }
}
