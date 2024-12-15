import { SharedModule, TenantModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from 'nest-router'
import { CopilotCheckpointModule } from '../copilot-checkpoint'
import { ChatMessageFeedbackController } from './feedback.controller'
import { ChatMessageFeedback } from './feedback.entity'
import { ChatMessageFeedbackService } from './feedback.service'

@Module({
	imports: [
		RouterModule.forRoutes([{ path: '/chat-message', module: ChatMessageFeedbackModule }]),
		forwardRef(() => TypeOrmModule.forFeature([ChatMessageFeedback])),
		forwardRef(() => TenantModule),
		SharedModule,
		CqrsModule,
		CopilotCheckpointModule
	],
	controllers: [ChatMessageFeedbackController],
	providers: [ChatMessageFeedbackService]
})
export class ChatMessageFeedbackModule {}
