import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { WidgetActionProviderRegistry } from '@xpert-ai/plugin-sdk'
import { ConversationRuntimeModule } from '../../chat-conversation/conversation-runtime.module'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { MessageWidgets } from '../../chat-message/widgets/message-widgets'
import { AI_ROUTE_PATH } from '../ai-route'
import { MessageWidgetActionsController } from './message-widget-actions.controller'

@Module({
    imports: [
        // Imported modules do not inherit AIModule's route prefix.
        RouterModule.register([{ path: AI_ROUTE_PATH, module: AIWidgetsModule }]),
        DiscoveryModule,
        CqrsModule,
        TypeOrmModule.forFeature([ChatMessage]),
        ConversationRuntimeModule
    ],
    controllers: [MessageWidgetActionsController],
    providers: [WidgetActionProviderRegistry, MessageWidgets],
    exports: [MessageWidgets]
})
export class AIWidgetsModule {}
