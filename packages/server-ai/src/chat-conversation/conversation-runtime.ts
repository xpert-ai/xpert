import { ForbiddenException, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { MessageWidgetProviderRegistry, type ConversationRuntimeApi } from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import { attachMessageWidget } from '../chat-message/widgets/message-widgets'
import { emitMessageWidget } from '../chat-message/widgets/message-widget-stream'
import { assertConversationTurnAccess, type ConversationTurn } from './conversation-turn'

@Injectable()
export class ConversationRuntimeService {
    constructor(
        private readonly db: DataSource,
        private readonly providers: MessageWidgetProviderRegistry,
        private readonly queries: QueryBus
    ) {}

    forTurn(turn: ConversationTurn): ConversationRuntimeApi {
        const scope = { ...turn }
        return {
            publishWidget: async (issuer, widget) => {
                if (!widget.widgetId?.trim() || !issuer || this.providers.findByName(widget.provider) !== issuer)
                    throw new ForbiddenException('Widget provider unavailable')
                await assertConversationTurnAccess(this.queries, scope)
                const reference = await attachMessageWidget(this.db.manager, scope.conversationId, {
                    provider: widget.provider,
                    widgetId: widget.widgetId,
                    threadId: scope.threadId,
                    ...(widget.messageId !== undefined
                        ? { messageId: widget.messageId }
                        : { executionId: scope.executionId })
                })
                await emitMessageWidget(reference)
            }
        }
    }
}
