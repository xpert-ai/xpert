import { SharedModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { ChatMessageFeedbackController } from './feedback.controller'
import { ChatMessageFeedback } from './feedback.entity'
import { ChatMessageFeedbackService } from './feedback.service'
import { ChatConversationModule } from '../chat-conversation'
import { ChatMessageModule } from '../chat-message/chat-message.module'
import { QueryHandlers } from './queries/handlers'

@Module({
    imports: [
        RouterModule.register([{ path: '/chat-message-feedback', module: ChatMessageFeedbackModule }]),
        TypeOrmModule.forFeature([ChatMessageFeedback]),
        SharedModule,
        CqrsModule,

        ChatConversationModule,
        ChatMessageModule
    ],
    controllers: [ChatMessageFeedbackController],
    providers: [ChatMessageFeedbackService, ...QueryHandlers],
    exports: [ChatMessageFeedbackService]
})
export class ChatMessageFeedbackModule {}
