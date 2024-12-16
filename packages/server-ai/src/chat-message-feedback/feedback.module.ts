import { SharedModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from 'nest-router'
import { ChatMessageFeedbackController } from './feedback.controller'
import { ChatMessageFeedback } from './feedback.entity'
import { ChatMessageFeedbackService } from './feedback.service'
import { ChatConversationModule } from '../chat-conversation'
import { CommandHandlers } from './commands/handlers'

@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/chat-message-feedback', module: ChatMessageFeedbackModule }]),
		TypeOrmModule.forFeature([ChatMessageFeedback]),
		SharedModule,
		CqrsModule,

		ChatConversationModule
	],
	controllers: [ChatMessageFeedbackController],
	providers: [ChatMessageFeedbackService, ...CommandHandlers]
})
export class ChatMessageFeedbackModule {}
